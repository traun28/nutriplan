/**
 * Engine regression checks — run with: npm run engine:check
 * Tests the nutrition processor and diet generator against realistic and
 * adversarial inputs. Exits non-zero on any failure.
 */
import { calculateBmi } from "../src/services/nutrition/bmi";
import {
  calculateGoalCalories,
  calculateMaintenanceEnergy,
  calculateRestingEnergy,
} from "../src/services/nutrition/energy";
import { calculateMacroTargets } from "../src/services/nutrition/macronutrients";
import { processUserProfile } from "../src/services/nutrition/nutritionProcessor";
import { rehydrateProfile } from "../src/lib/profileNormalize";
import { generateDietPlan, regenerateDietPlan } from "../src/services/diet/dietGenerator";
import { validateGeneratedDietPlan } from "../src/services/diet/planValidator";
import { FOOD_BY_ID } from "../src/data/foods/foodDatabase";
import { validateFoodDatabase } from "../src/data/foods/validateDatabase";
import type { UserProfile, ProcessedProfile } from "../src/types/profile";

let failures = 0;
let passes = 0;
function check(name: string, ok: boolean, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
  if (ok) passes++; else failures++;
}

/* ------------------------------------------------------------------ */
/* 1. Nutrition edge cases                                             */
/* ------------------------------------------------------------------ */

check("BMI: null inputs → null", calculateBmi(null, 170) === null);
check("BMI: zero height → null", calculateBmi(70, 0) === null);
check("BMI: negative weight → null", calculateBmi(-5, 170) === null);
check("BMI: NaN → null", calculateBmi(NaN, 170) === null);
check("BMI: Infinity → null", calculateBmi(Infinity, 170) === null);
const bmi70 = calculateBmi(70, 170);
check(
  "BMI: 70kg/170cm ≈ 24.2 normal",
  bmi70 !== null && bmi70.value === 24.2 && bmi70.category === "normal",
  `got ${JSON.stringify(bmi70)}`,
);

check("BMR: missing age → null", calculateRestingEnergy({ weightKg: 70, heightCm: 170, age: null, gender: "male" }) === null);
check("BMR: zero weight → null", calculateRestingEnergy({ weightKg: 0, heightCm: 170, age: 30, gender: "male" }) === null);
const bmr = calculateRestingEnergy({ weightKg: 70, heightCm: 170, age: 25, gender: "male" });
// 10*70 + 6.25*170 - 5*25 + 5 = 700 + 1062.5 - 125 + 5 = 1642.5
check("BMR: 70/170/25M = 1642.5 → 1643", bmr?.calories === 1643, `got ${bmr?.calories}`);
const bmrNeutral = calculateRestingEnergy({ weightKg: 70, heightCm: 170, age: 25, gender: "" });
check("BMR: neutral constant reported", bmrNeutral?.usedNeutralConstant === true);

check("Maintenance: no activity → null", calculateMaintenanceEnergy(1642, "") === null);
const maint = calculateMaintenanceEnergy(1642, "moderately_active");
check("Maintenance: moderate ×1.55", maint !== null && maint.calories > 1642, `got ${maint?.calories}`);

const goalLoss = calculateGoalCalories(maint?.calories ?? null, "weight_loss", bmr?.calories ?? null);
check(
  "Goal: lose weight below maintenance, never below BMR",
  goalLoss !== null && goalLoss.calories < (maint?.calories ?? 0) && goalLoss.calories >= (bmr?.calories ?? 0),
  `got ${goalLoss?.calories} (bmr ${bmr?.calories})`,
);

const macroBigProtein = calculateMacroTargets({
  calories: 1500,
  proteinGrams: 250, // 1000 kcal of protein alone
  proteinSource: "user",
  estimatedProteinGrams: 100,
  userProvidedProteinGrams: 250,
  proteinGramsPerKg: null,
});
check(
  "Macros: huge protein → carbs ≥ 0, no negative grams",
  macroBigProtein.macros.carbohydrates.grams !== null && macroBigProtein.macros.carbohydrates.grams >= 0 &&
  macroBigProtein.macros.fat.grams !== null && macroBigProtein.macros.fat.grams >= 0,
  `carbs ${macroBigProtein.macros.carbohydrates.grams} fat ${macroBigProtein.macros.fat.grams} notes ${macroBigProtein.notes.length}`,
);
const macroNormal = calculateMacroTargets({
  calories: 2200,
  proteinGrams: 140,
  proteinSource: "calculated",
  estimatedProteinGrams: 140,
  userProvidedProteinGrams: null,
  proteinGramsPerKg: null,
});
check(
  "Macros: 2200kcal/140g protein → sensible carbs+fat",
  (macroNormal.macros.carbohydrates.grams ?? 0) > 100 && (macroNormal.macros.fat.grams ?? 0) > 30,
  `carbs ${macroNormal.macros.carbohydrates.grams} fat ${macroNormal.macros.fat.grams}`,
);

/* ------------------------------------------------------------------ */
/* 2. Full processor: incomplete + complete profiles                   */
/* ------------------------------------------------------------------ */

const emptyProfile = rehydrateProfile({});
const emptyResult = processUserProfile(emptyProfile);
check(
  "Processor: empty profile → success=false with errors, no crash",
  emptyResult.success === false && emptyResult.errors.length > 0 && emptyResult.processed.bmi === null,
  `${emptyResult.errors.length} errors`,
);

function baseProfile(): UserProfile {
  return rehydrateProfile({
    personalDetails: {
      fullName: "Test Person",
      age: 24,
      gender: "male",
      heightCm: 175,
      weightKg: 70,
      activityLevel: "moderately_active",
    },
    nutritionalInformation: { primaryGoal: "weight_maintenance" },
    dietaryPreferences: {  },
  });
}

const fullResult = processUserProfile(baseProfile());
check(
  "Processor: complete profile → success, BMI+calories+macros present",
  fullResult.success === true &&
  fullResult.processed.bmi !== null &&
  (fullResult.processed.energy.selectedCalories ?? 0) > 0 &&
  (fullResult.processed.macronutrients.carbohydrates.grams ?? 0) > 0,
  `cal ${fullResult.processed.energy.selectedCalories} err ${fullResult.errors.length}`,
);

const userTarget = baseProfile();
userTarget.nutritionalInformation.dailyCalorieTarget = 2000;
userTarget.nutritionalInformation.proteinTargetGrams = 160;
const userResult = processUserProfile(userTarget);
check(
  "Processor: user targets take priority",
  userResult.processed.energy.selectedSource === "user" &&
  userResult.processed.energy.selectedCalories === 2000 &&
  userResult.processed.macronutrients.protein.selectedGrams === 160,
  `src ${userResult.processed.energy.selectedSource}`,
);

const badAge = baseProfile();
badAge.personalDetails.age = 250; // outside 10..100
const badResult = processUserProfile(badAge);
check(
  "Processor: out-of-range age → error, no bogus numbers",
  badResult.success === false && badResult.processed.energy.selectedCalories === null,
);

/* ------------------------------------------------------------------ */
/* 3. Diet generation                                                  */
/* ------------------------------------------------------------------ */

const processed: ProcessedProfile = fullResult.processed;

const planNoRestrictions = generateDietPlan(baseProfile(), processed, { variationSeed: 42 });
check(
  "Generator: base profile → valid plan",
  planNoRestrictions.success === true &&
  planNoRestrictions.plan.meals.length >= 3 &&
  planNoRestrictions.plan.validation.isValid === true,
  planNoRestrictions.success ? `${planNoRestrictions.plan.meals.length} meals, ${planNoRestrictions.plan.dailyTotals.calories} kcal` : planNoRestrictions.message,
);

function planHasIngredient(plan: { meals: Array<{ items: Array<{ foodId: string; name: string; ingredients: string[] }> }> }, needle: string): string | null {
  const n = needle.toLowerCase();
  for (const meal of plan.meals) {
    for (const item of meal.items) {
      const food = FOOD_BY_ID.get(item.foodId);
      const all = [item.name, ...(food?.ingredients ?? [])].map((s) => s.toLowerCase());
      if (all.some((s) => s.includes(n))) return item.name;
    }
  }
  return null;
}

const peanutProfile = baseProfile();
peanutProfile.allergies = ["peanuts"];
const peanutPlan = generateDietPlan(peanutProfile, processed, { variationSeed: 7 });
check(
  "Generator: peanut allergy → no peanut food anywhere",
  peanutPlan.success === true && planHasIngredient(peanutPlan.plan, "peanut") === null,
  peanutPlan.success ? "clean" : peanutPlan.message,
);

const vegProfile = baseProfile();
vegProfile.dietaryPreferences.dietaryType = "vegetarian";
const vegPlan = generateDietPlan(vegProfile, processed, { variationSeed: 7 });
const vegMeatHit = vegPlan.success
  ? [planHasIngredient(vegPlan.plan, "chicken"), planHasIngredient(vegPlan.plan, "chicken"), planHasIngredient(vegPlan.plan, "mutton"), planHasIngredient(vegPlan.plan, "fish"), planHasIngredient(vegPlan.plan, "egg")].filter(Boolean)
  : ["n/a"];
check(
  "Generator: vegetarian → no meat/fish/egg dishes",
  vegPlan.success === true && vegMeatHit.length === 0,
  vegPlan.success ? (vegMeatHit.length ? `hits: ${vegMeatHit.join(",")}` : "clean") : vegPlan.message,
);

const lactoseProfile = baseProfile();
lactoseProfile.intolerances = ["lactose"];
const lactosePlan = generateDietPlan(lactoseProfile, processed, { variationSeed: 11 });
check(
  "Generator: lactose intolerance → no dairy ingredients",
  lactosePlan.success === true &&
  planHasIngredient(lactosePlan.plan, "milk") === null &&
  planHasIngredient(lactosePlan.plan, "paneer") === null &&
  planHasIngredient(lactosePlan.plan, "cheese") === null,
  lactosePlan.success ? "clean" : lactosePlan.message,
);

const avoidProfile = baseProfile();
avoidProfile.foodsToAvoid = ["paneer"];
const avoidPlan = generateDietPlan(avoidProfile, processed, { variationSeed: 13 });
check(
  "Generator: foodsToAvoid paneer → no paneer dishes",
  avoidPlan.success === true && planHasIngredient(avoidPlan.plan, "paneer") === null,
  avoidPlan.success ? "clean" : avoidPlan.message,
);

const noTargets = generateDietPlan(baseProfile(), null, { variationSeed: 1 });
check(
  "Generator: no targets → TARGETS_UNAVAILABLE, no crash",
  noTargets.success === false && noTargets.reason === "TARGETS_UNAVAILABLE",
  noTargets.success ? "unexpected success" : noTargets.reason,
);

const allSkipped = baseProfile();
(allSkipped.foodIntake as unknown as Record<string, { hasMeal?: boolean }>).breakfast.hasMeal = false;
(allSkipped.foodIntake as unknown as Record<string, { hasMeal?: boolean }>).lunch.hasMeal = false;
(allSkipped.foodIntake as unknown as Record<string, { hasMeal?: boolean }>).dinner.hasMeal = false;
(allSkipped.foodIntake as unknown as Record<string, { hasMeal?: boolean }>).morningSnack.hasMeal = false;
(allSkipped.foodIntake as unknown as Record<string, { hasMeal?: boolean }>).eveningSnack.hasMeal = false;
const skipped = generateDietPlan(allSkipped, processed, { variationSeed: 1 });
check(
  "Generator: all meals skipped → clean failure",
  skipped.success === false,
  skipped.success ? "unexpected success" : skipped.reason,
);

const impossiblyStrict = baseProfile();
impossiblyStrict.allergies = ["peanuts", "milk_dairy", "eggs", "soy", "wheat", "gluten", "fish", "shellfish", "tree_nuts", "sesame"];
impossiblyStrict.dietaryPreferences.dietaryType = "vegetarian";
impossiblyStrict.foodsToAvoid = ["rice", "oats", "banana", "potato", "moong dal", "chickpea"];
const strict = generateDietPlan(impossiblyStrict, processed, { variationSeed: 3 });
check(
  "Generator: impossible restrictions → structured failure, NOT an unsafe plan",
  strict.success === false,
  strict.success ? "UNSAFE: plan returned" : `${strict.reason}: ${strict.message.slice(0, 60)}`,
);

// Determinism: same seed → identical meals
const d1 = generateDietPlan(baseProfile(), processed, { variationSeed: 99 });
const d2 = generateDietPlan(baseProfile(), processed, { variationSeed: 99 });
check(
  "Generator: deterministic for a fixed seed",
  d1.success && d2.success &&
  d1.plan.meals.map((m) => m.name).join("|") === d2.plan.meals.map((m) => m.name).join("|"),
);

// Regeneration differs (usually) but stays valid
const reg = regenerateDietPlan(baseProfile(), processed, d1.success ? d1.plan : null);
check(
  "Generator: regenerate → valid plan (may differ)",
  reg.success === true && reg.plan.validation.isValid === true,
  reg.success ? "valid" : reg.message,
);

// Independent validator really re-checks: force a violation
if (planNoRestrictions.success) {
  const tampered = JSON.parse(JSON.stringify(planNoRestrictions.plan)) as import("../src/types/profile").DietPlan;
  const meal = tampered.meals[0];
  // swap in a food known to contain peanuts if one exists
  const peanutFood = [...FOOD_BY_ID.values()].find((f) => f.allergens.includes("peanuts"));
  if (peanutFood) {
    meal.items = meal.items.map((item) => ({ ...item, foodId: peanutFood.id, name: peanutFood.name, ingredients: peanutFood.ingredients }));
    const tamperedProfile = baseProfile();
    tamperedProfile.allergies = ["peanuts"];
    const verdict = validateGeneratedDietPlan(tampered, tamperedProfile);
    check(
      "Validator: tampered plan (peanut for allergic user) → invalid",
      verdict.isValid === false && verdict.checks.allergies === "failed",
      `errors: ${verdict.errors.length}`,
    );
  } else {
    check("Validator: tampered plan (peanut for allergic user) → invalid", false, "no peanut food in database?");
  }
}

// Portion bounds respected
if (planNoRestrictions.success) {
  const withinBounds = planNoRestrictions.plan.meals.every(
    (m) => m.items.every((i) => i.servings >= 0.25 - 0.001 && i.servings <= 6 + 0.001),
  );
  check("Generator: servings within realistic bounds", withinBounds);
  const finiteNutrition = planNoRestrictions.plan.meals.every(
    (m) => [m.calories, m.proteinGrams, m.carbohydrateGrams, m.fatGrams].every(Number.isFinite),
  );
  check("Generator: all nutrition totals finite", finiteNutrition);
}

// Calorie alignment within hard tolerance
if (planNoRestrictions.success) {
  const target = planNoRestrictions.plan.summary.targetCalories;
  const drift = Math.abs(planNoRestrictions.plan.dailyTotals.calories - target) / target;
  check(
    "Generator: daily calories within 20% of target",
    drift <= 0.2,
    `${planNoRestrictions.plan.dailyTotals.calories} vs ${target} (${Math.round(drift * 100)}%)`,
  );
}

/* ------------------------------------------------------------------ */
/* 4. Food database integrity                                          */
/* ------------------------------------------------------------------ */

const databaseIssues = validateFoodDatabase();
check(
  "Food database: no integrity issues",
  databaseIssues.length === 0,
  databaseIssues.slice(0, 3).map((issue) => `${issue.foodId}: ${issue.problem}`).join("; "),
);

/* ------------------------------------------------------------------ */
console.log(failures === 0 ? `\nENGINE: ALL ${passes} PASS` : `\nENGINE: ${failures} FAILURES / ${passes} pass`);
process.exit(failures === 0 ? 0 : 1);
