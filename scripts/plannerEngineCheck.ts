/**
 * 7-day planner regression checks — run with: npm run test:planner
 *
 * Covers the behaviour that produced the production `POST /api/meal-plans`
 * 422: a complete, unrestricted profile whose calorie target was higher than
 * a single dish per meal could reach. Also checks the safety guarantees
 * (allergies, intolerances, dietary pattern), the 7-day shape, start-date
 * anchoring, and the "genuinely too restricted" failure path.
 *
 * Pure engine checks — no server and no database. Exits non-zero on failure.
 */
import type { UserProfile } from "../src/types/profile";
import { FOOD_BY_ID } from "../src/data/foods/foodDatabase";
import { processUserProfile } from "../src/services/nutrition/nutritionProcessor";
import { PORTION_BOUNDS } from "../src/services/diet/config";
import {
  generateDietPlan,
  MAX_ITEMS_PER_MEAL,
} from "../src/services/diet/dietGenerator";
import {
  violatesAllergy,
  violatesDietaryType,
  violatesIntolerance,
} from "../src/services/diet/filters";
import {
  DAYS_PER_WEEK,
  generateWeeklyPlan,
  regenerateWeeklyDay,
  shiftDate,
  validateWeeklyPlanData,
  type WeeklyPlanData,
} from "../src/services/diet/weeklyPlanner";
import { buildExtremeRestrictionProfile, buildProfile } from "./profileFixtures";

let failures = 0;
let passes = 0;
function check(name: string, ok: boolean, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  — ${extra}` : ""}`);
  if (ok) passes++;
  else failures++;
}

function processFor(profile: UserProfile) {
  const result = processUserProfile(profile);
  return result.success ? result.processed : null;
}

/** All planned items (with their database records) across a weekly plan. */
function plannedFoods(data: WeeklyPlanData) {
  return data.days.flatMap((day) =>
    day.plan.meals.flatMap((meal) =>
      meal.items.map((item) => ({ meal: meal.label, item, food: FOOD_BY_ID.get(item.foodId) })),
    ),
  );
}

/* ------------------------------------------------------------------ */
/* 1. Every dietary pattern and body type generates a full week        */
/* ------------------------------------------------------------------ */

const generationCases: { name: string; profile: UserProfile }[] = [
  { name: "typical male · weight loss · non-vegetarian", profile: buildProfile() },
  {
    name: "vegetarian · general health",
    profile: buildProfile({ dietaryType: "vegetarian", goal: "general_health" }),
  },
  {
    name: "vegan · weight loss · 5 meals",
    profile: buildProfile({ dietaryType: "vegan", mealsPerDay: 5 }),
  },
  {
    name: "eggetarian · muscle gain",
    profile: buildProfile({ dietaryType: "eggetarian", goal: "muscle_gain", mealsPerDay: 5 }),
  },
  {
    name: "female · sedentary · maintenance",
    profile: buildProfile({
      gender: "female",
      heightCm: 162,
      weightKg: 64,
      activityLevel: "sedentary",
      goal: "weight_maintenance",
    }),
  },
  {
    name: "pescatarian · 2 meals (skipped snacks)",
    profile: buildProfile({
      dietaryType: "pescatarian",
      mealsPerDay: 2,
      skippedMeals: ["morningSnack", "eveningSnack"],
    }),
  },
  {
    name: "high calorie target 3200 kcal (regression)",
    profile: buildProfile({ dailyCalorieTarget: 3200 }),
  },
  {
    name: "very active · weight gain (regression)",
    profile: buildProfile({ activityLevel: "very_active", goal: "weight_gain" }),
  },
];

for (const testCase of generationCases) {
  const processed = processFor(testCase.profile);
  if (!processed) {
    check(`${testCase.name}: nutrition targets available`, false);
    continue;
  }
  const result = generateWeeklyPlan(testCase.profile, processed, {});
  if (!result.success) {
    check(
      `${testCase.name}: 7-day plan generated`,
      false,
      `${result.reason} — ${result.message}`,
    );
    continue;
  }
  const data = result.data;
  const target = data.targets.calories;
  const average = data.summary.averageCalories;
  const drift = target > 0 ? Math.abs(average - target) / target : 1;
  const items = plannedFoods(data);
  const servingsInBounds = items.every(
    (entry) =>
      entry.item.servings >= PORTION_BOUNDS.min - 0.001 &&
      entry.item.servings <= PORTION_BOUNDS.max + 0.001,
  );
  const mealSizesInBounds = data.days.every((day) =>
    day.plan.meals.every((meal) => meal.items.length >= 1 && meal.items.length <= MAX_ITEMS_PER_MEAL),
  );

  check(
    `${testCase.name}: 7-day plan generated`,
    true,
    `${average} kcal avg vs ${target} target`,
  );
  check(`${testCase.name}: exactly ${DAYS_PER_WEEK} days`, data.days.length === DAYS_PER_WEEK);
  check(
    `${testCase.name}: every day has meals`,
    data.days.every((day) => day.plan.meals.length > 0),
  );
  check(
    `${testCase.name}: average calories within 10% of target`,
    drift <= 0.1,
    `${average} vs ${target} (${Math.round(drift * 100)}%)`,
  );
  check(`${testCase.name}: portions inside realistic bounds`, servingsInBounds);
  check(
    `${testCase.name}: at most ${MAX_ITEMS_PER_MEAL} dishes per meal`,
    mealSizesInBounds,
  );
}

/* ------------------------------------------------------------------ */
/* 2. Allergies, intolerances and dietary pattern are never broken     */
/* ------------------------------------------------------------------ */

const allergyProfile = buildProfile({ allergies: ["peanuts", "tree_nuts"] });
const allergyProcessed = processFor(allergyProfile);
const allergyPlan = allergyProcessed
  ? generateWeeklyPlan(allergyProfile, allergyProcessed, {})
  : null;
check("allergy profile: 7-day plan generated", allergyPlan?.success === true);
if (allergyPlan?.success) {
  const offenders = plannedFoods(allergyPlan.data).filter(
    (entry) => entry.food && violatesAllergy(entry.food, allergyProfile.allergies),
  );
  check(
    "allergy profile: no planned dish contains a declared allergen",
    offenders.length === 0,
    offenders.map((entry) => entry.food?.name).join(", "),
  );
}

const veganProfile = buildProfile({ dietaryType: "vegan", mealsPerDay: 5 });
const veganProcessed = processFor(veganProfile);
const veganPlan = veganProcessed ? generateWeeklyPlan(veganProfile, veganProcessed, {}) : null;
check("vegan profile: 7-day plan generated", veganPlan?.success === true);
if (veganPlan?.success) {
  const offenders = plannedFoods(veganPlan.data).filter(
    (entry) => entry.food && violatesDietaryType(entry.food, "vegan"),
  );
  check(
    "vegan profile: every planned dish is vegan-compatible",
    offenders.length === 0,
    offenders.map((entry) => entry.food?.name).join(", "),
  );
}

const glutenProfile = buildProfile({ intolerances: ["gluten"] });
const glutenProcessed = processFor(glutenProfile);
const glutenPlan = glutenProcessed ? generateWeeklyPlan(glutenProfile, glutenProcessed, {}) : null;
check("gluten intolerance: 7-day plan generated", glutenPlan?.success === true);
if (glutenPlan?.success) {
  const offenders = plannedFoods(glutenPlan.data).filter(
    (entry) => entry.food && violatesIntolerance(entry.food, ["gluten"]),
  );
  check(
    "gluten intolerance: no planned dish conflicts",
    offenders.length === 0,
    offenders.map((entry) => entry.food?.name).join(", "),
  );
}

/* ------------------------------------------------------------------ */
/* 3. Genuinely too-restricted profiles fail safely and explain why    */
/* ------------------------------------------------------------------ */

const extremeProfile = buildExtremeRestrictionProfile();
const extremeProcessed = processFor(extremeProfile);
const extremeResult = extremeProcessed
  ? generateWeeklyPlan(extremeProfile, extremeProcessed, {})
  : null;

check(
  "extreme restrictions: generation fails safely (no plan, no unsafe fallback)",
  extremeResult?.success === false,
);
if (extremeResult && !extremeResult.success) {
  check(
    "extreme restrictions: failure reason is INSUFFICIENT_OPTIONS",
    extremeResult.reason === "INSUFFICIENT_OPTIONS",
    extremeResult.reason,
  );
  check(
    "extreme restrictions: message states the calorie limit, not a false restriction claim",
    /calorie target/i.test(extremeResult.message) && /kcal/i.test(extremeResult.message),
    extremeResult.message,
  );
  check(
    "extreme restrictions: details report compatible/excluded option counts",
    extremeResult.details.some((detail) => /of 53 foods/.test(detail)),
    extremeResult.details[0] ?? "",
  );
}

/* ------------------------------------------------------------------ */
/* 4. Anchoring, regeneration and whole-plan validation                */
/* ------------------------------------------------------------------ */

const anchoredProfile = buildProfile();
const anchoredProcessed = processFor(anchoredProfile);
const anchored = anchoredProcessed
  ? generateWeeklyPlan(anchoredProfile, anchoredProcessed, { startDate: "2026-03-02" })
  : null;
check("start date: plan generated", anchored?.success === true);
if (anchored?.success) {
  const datesOk = anchored.data.days.every(
    (day) => day.date === shiftDate("2026-03-02", day.dayIndex),
  );
  check("start date: every day is anchored to the start date", datesOk);
  check(
    "start date: weekdays follow the anchor (2026-03-02 is a Monday)",
    anchored.data.days[0]?.weekday === "Mon" && anchored.data.days[6]?.weekday === "Sun",
    `${anchored.data.days[0]?.weekday} … ${anchored.data.days[6]?.weekday}`,
  );

  const regenerated = regenerateWeeklyDay(anchored.data, anchoredProfile, anchoredProcessed, 3);
  check("regenerate day: succeeds", regenerated.success === true);
  if (regenerated.success) {
    const otherDaysUntouched = regenerated.data.days
      .filter((day) => day.dayIndex !== 3)
      .every((day) => {
        const original = anchored.data.days.find((entry) => entry.dayIndex === day.dayIndex);
        return original?.plan.id === day.plan.id;
      });
    check("regenerate day: the other six days are untouched", otherDaysUntouched);
    check(
      "regenerate day: all 7 days still validate",
      validateWeeklyPlanData(regenerated.data, anchoredProfile).isValid,
    );
  }
}

/* ------------------------------------------------------------------ */
/* 5. No targets, no invented plan                                     */
/* ------------------------------------------------------------------ */

const noTargets = generateWeeklyPlan(buildProfile(), null, {});
check(
  "missing targets: generation refuses instead of inventing values",
  noTargets.success === false && noTargets.reason === "TARGETS_UNAVAILABLE",
  noTargets.success ? "unexpected success" : noTargets.reason,
);

/* ------------------------------------------------------------------ */
/* 6. The single-day engine keeps the same safety guarantees           */
/* ------------------------------------------------------------------ */

const dayProfile = buildProfile({ allergies: ["peanuts"] });
const dayProcessed = processFor(dayProfile);
const dayPlan = dayProcessed ? generateDietPlan(dayProfile, dayProcessed, {}) : null;
check("daily plan: generated for a complete profile", dayPlan?.success === true);
if (dayPlan?.success) {
  const offenders = dayPlan.plan.meals.flatMap((meal) =>
    meal.items.filter((item) => {
      const food = FOOD_BY_ID.get(item.foodId);
      return food ? violatesAllergy(food, dayProfile.allergies) : false;
    }),
  );
  check("daily plan: no allergen in the plan", offenders.length === 0);
  check(
    "daily plan: at most the shared dish limit per meal",
    dayPlan.plan.meals.every((meal) => meal.items.length <= MAX_ITEMS_PER_MEAL),
  );
}

/* ------------------------------------------------------------------ */
console.log(
  failures === 0
    ? `\nPLANNER: ALL ${passes} PASS`
    : `\nPLANNER: ${failures} FAILURES / ${passes} pass`,
);
process.exit(failures === 0 ? 0 : 1);
