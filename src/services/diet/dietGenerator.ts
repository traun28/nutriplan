/**
 * Part 7 — the personalised diet-generation engine.
 *
 * PIPELINE
 *   1. Read the saved profile and the Part 6 processed targets.
 *   2. Decide which meal slots the plan needs (habits + frequency).
 *   3. Split the daily calorie target across those slots.
 *   4. Remove every food that breaks a restriction (filters.ts).
 *   5. Score the survivors for this user and this slot (scoring.ts).
 *   6. Pick from the top candidates using a seeded random choice.
 *   7. Scale the portion towards the slot's calorie budget.
 *   8. Re-balance the day if the total drifts from the target.
 *   9. Re-validate the finished plan independently (planValidator.ts).
 *  10. Return the plan, or a safe structured failure.
 *
 * The engine is rule-based and deterministic for a given seed: no
 * external API, no generative AI, fully explainable for a viva.
 *
 * It NEVER recalculates BMI, BMR or the calorie/macro targets — those
 * come from Part 6.
 */
import type {
  DietPlan,
  FoodItemRecord,
  GenerationOptions,
  GenerationResult,
  PlannedFoodItem,
  PlannedMeal,
  ProcessedProfile,
  UserProfile,
} from "@/types/profile";
import { CURRENT_DIET_PLAN_VERSION } from "@/types/profile";
import { DIETARY_TYPES, labelFor, mealLabel, unitLabel } from "@/data/options";
import { FOOD_DATABASE } from "@/data/foods/foodDatabase";
import { createId } from "@/lib/id";
import { roundTo, clamp } from "@/lib/numbers";
import {
  DEFAULT_MEAL_TIMES,
  DISTRIBUTION_TEMPLATES,
  PLAN_TOLERANCES,
  PORTION_BOUNDS,
  SLOT_CATEGORY,
  SLOT_ORDER,
  CANDIDATE_POOL_SIZE,
  type PlannerSlot,
} from "@/services/diet/config";
import { PREP_TIME_LIMITS } from "@/services/diet/config";
import { filterFoods, foodsForCategory } from "@/services/diet/filters";
import { collectHabitFoods, scoreFood } from "@/services/diet/scoring";
import { validateGeneratedDietPlan } from "@/services/diet/planValidator";
import { buildRecommendations } from "@/services/diet/recommendations";
import { describePersonalisation } from "@/services/diet/personalisation";
import { getDatasetSignal } from "@/services/dataset/datasetService";
import { datasetPreferenceSignal } from "@/data/dataset/similarProfiles";

/* ------------------------------------------------------------------ */
/* Seeded pseudo-random generator (so regeneration is reproducible)     */
/* ------------------------------------------------------------------ */

function createRandom(seed: number): () => number {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

/* ------------------------------------------------------------------ */
/* Slot planning                                                       */
/* ------------------------------------------------------------------ */

/**
 * Decides which meals the plan should contain.
 * Respects explicit "I usually skip this meal" answers and the user's
 * stated meals-per-day, instead of always producing five meals.
 */
export function determineSlots(profile: UserProfile): PlannerSlot[] {
  const notSkipped = SLOT_ORDER.filter(
    (slot) => profile.foodIntake[slot]?.hasMeal !== false,
  );

  // Main meals are kept first; snacks are dropped when the user eats less often.
  const mains = notSkipped.filter((slot) =>
    ["breakfast", "lunch", "dinner"].includes(slot),
  );
  const snacks = notSkipped.filter((slot) =>
    ["morningSnack", "eveningSnack"].includes(slot),
  );

  const desired = profile.mealHabits.mealsPerDay;
  if (desired === null) {
    return SLOT_ORDER.filter((slot) => notSkipped.includes(slot));
  }

  const target = clamp(desired, 2, 5);
  const chosen = [...mains.slice(0, Math.max(2, Math.min(mains.length, target)))];
  for (const snack of snacks) {
    if (chosen.length >= target) break;
    chosen.push(snack);
  }
  return SLOT_ORDER.filter((slot) => chosen.includes(slot));
}

/** Splits the daily calorie target across the chosen slots. */
export function buildDistribution(
  slots: PlannerSlot[],
): Record<PlannerSlot, number> {
  const template =
    DISTRIBUTION_TEMPLATES[slots.length] ?? DISTRIBUTION_TEMPLATES[3];

  const shares = {} as Record<PlannerSlot, number>;
  let assigned = 0;

  for (const slot of slots) {
    const share = template[slot];
    if (share !== undefined) {
      shares[slot] = share;
      assigned += share;
    }
  }

  // Any slot missing from the template gets an equal cut of the remainder.
  const missing = slots.filter((slot) => shares[slot] === undefined);
  if (missing.length > 0) {
    const remainder = Math.max(0, 1 - assigned) / missing.length;
    for (const slot of missing) {
      shares[slot] = remainder;
      assigned += remainder;
    }
  }

  // Normalise so the shares always add up to exactly 1.
  const total = slots.reduce((sum, slot) => sum + (shares[slot] ?? 0), 0) || 1;
  for (const slot of slots) shares[slot] = (shares[slot] ?? 0) / total;

  return shares;
}

/* ------------------------------------------------------------------ */
/* Portion scaling                                                     */
/* ------------------------------------------------------------------ */

/**
 * Scales a food towards a calorie budget within realistic bounds.
 * Linear scaling is an approximation and is documented as such.
 */
export function chooseServings(food: FoodItemRecord, targetCalories: number): number {
  if (food.calories <= 0) return 1;
  const ideal = targetCalories / food.calories;
  const bounded = clamp(
    ideal,
    Math.max(PORTION_BOUNDS.min, food.minServings),
    Math.min(PORTION_BOUNDS.max, food.maxServings),
  );
  const stepped =
    Math.round(bounded / PORTION_BOUNDS.step) * PORTION_BOUNDS.step;
  return Math.max(PORTION_BOUNDS.step, roundTo(stepped, 2));
}

export function buildPlannedItem(
  food: FoodItemRecord,
  servings: number,
): PlannedFoodItem {
  const portionQuantity = roundTo(food.servingSize.quantity * servings, 2);
  return {
    foodId: food.id,
    name: food.name,
    servings,
    portionLabel: `${portionQuantity} ${unitLabel(food.servingSize.unit)}`,
    calories: Math.round(food.calories * servings),
    proteinGrams: roundTo(food.proteinGrams * servings, 1),
    carbohydrateGrams: roundTo(food.carbohydrateGrams * servings, 1),
    fatGrams: roundTo(food.fatGrams * servings, 1),
    ingredients: food.ingredients,
    preparationTimeMinutes: food.preparationTimeMinutes,
  };
}

export function mealFromItems(
  slot: PlannerSlot,
  items: PlannedFoodItem[],
  time: string,
  targetShare: number,
  notes: string,
): PlannedMeal {
  const sum = (pick: (item: PlannedFoodItem) => number) =>
    items.reduce((total, item) => total + pick(item), 0);

  return {
    id: createId("meal"),
    type: slot,
    label: mealLabel(slot),
    name: items.map((item) => item.name).join(" + "),
    time,
    items,
    calories: Math.round(sum((item) => item.calories)),
    proteinGrams: roundTo(sum((item) => item.proteinGrams), 1),
    carbohydrateGrams: roundTo(sum((item) => item.carbohydrateGrams), 1),
    fatGrams: roundTo(sum((item) => item.fatGrams), 1),
    preparationTimeMinutes: Math.max(
      0,
      ...items.map((item) => item.preparationTimeMinutes),
    ),
    notes,
    targetShare,
  };
}

/* ------------------------------------------------------------------ */
/* Main entry point                                                    */
/* ------------------------------------------------------------------ */

/**
 * Maximum generation attempts before giving up.
 * Guarantees the repair loop can never run forever (Part 9 requirement).
 */
export const MAX_GENERATION_ATTEMPTS = 4;

/** Phase 3 — small ranking nudge for `GenerationOptions.preferTags`. */
const PREFERRED_TAG_BOOST = 0.06;
/** Phase 4 — maximum nudge when every ingredient of a food is in the pantry. */
const PANTRY_BOOST_MAX = 0.08;

/** Phase 4 — 0..PANTRY_BOOST_MAX, proportional to the share of ingredients on hand. */
export function pantryBoost(food: FoodItemRecord, preferIngredients: string[] | undefined): number {
  if (!preferIngredients || preferIngredients.length === 0 || food.ingredients.length === 0) return 0;
  const have = new Set(preferIngredients);
  const matched = food.ingredients.filter((ingredient) => have.has(ingredient)).length;
  return matched === 0 ? 0 : PANTRY_BOOST_MAX * (matched / food.ingredients.length);
}

/**
 * Public entry point.
 *
 * Runs `buildPlan` up to MAX_GENERATION_ATTEMPTS times. If a candidate
 * plan fails the independent safety validator, the offending foods are
 * excluded and generation is retried with a new seed — a safe repair,
 * never a relaxation of the restrictions. If no attempt produces a valid
 * plan, a structured failure is returned instead of an unsafe fallback.
 */
export function generateDietPlan(
  profile: UserProfile,
  processed: ProcessedProfile | null,
  options: GenerationOptions = {},
): GenerationResult {
  const excluded = [...(options.excludeFoodIds ?? [])];
  let lastFailure: GenerationResult | null = null;

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const seed =
      (options.variationSeed ?? Math.floor(Math.random() * 1_000_000) + 1) +
      (attempt - 1) * 7919;

    const result = buildPlan(profile, processed, {
      variationSeed: seed,
      excludeFoodIds: excluded,
      preferTags: options.preferTags,
      preferIngredients: options.preferIngredients,
    });

    if (result.success) {
      result.plan.validation.attempts = attempt;
      return result;
    }

    lastFailure = result;

    // Only a failed SAFETY check is worth repairing: drop the offending
    // foods and try again. Other failures will not change on a retry.
    if (result.reason !== "VALIDATION_FAILED" || result.offendingFoodIds.length === 0) {
      return result;
    }
    excluded.push(...result.offendingFoodIds);
  }

  return (
    lastFailure ?? {
      success: false,
      reason: "VALIDATION_FAILED",
      message:
        "We could not build a plan that passed every safety check. Please review your restrictions and try again.",
      details: [],
      offendingFoodIds: [],
    }
  );
}

/** One generation attempt. Pure apart from the timestamp and the seed. */
function buildPlan(
  profile: UserProfile,
  processed: ProcessedProfile | null,
  options: GenerationOptions = {},
): GenerationResult {
  /* --- 1. Preconditions ------------------------------------------- */
  if (!processed) {
    return {
      success: false,
      reason: "TARGETS_UNAVAILABLE",
      message:
        "Your nutrition targets have not been calculated yet. Calculate your nutrition profile first.",
      details: [],
      offendingFoodIds: [],
    };
  }

  const targetCalories = processed.energy.selectedCalories;
  const targetProtein = processed.macronutrients.protein.selectedGrams;
  const targetCarbs = processed.macronutrients.carbohydrates.grams;
  const targetFat = processed.macronutrients.fat.grams;

  if (
    targetCalories === null ||
    targetProtein === null ||
    targetCarbs === null ||
    targetFat === null
  ) {
    return {
      success: false,
      reason: "PROFILE_INCOMPLETE",
      message:
        "Some details are still missing, so a complete set of nutrition targets is not available yet.",
      details: ["Complete your profile and recalculate your nutrition targets."],
      offendingFoodIds: [],
    };
  }

  /* --- 2. Slots and distribution ---------------------------------- */
  const slots = determineSlots(profile);
  if (slots.length === 0) {
    return {
      success: false,
      reason: "PROFILE_INCOMPLETE",
      message: "Every meal is marked as skipped, so there is nothing to plan.",
      details: ["Enable at least one meal in the Food Intake section."],
      offendingFoodIds: [],
    };
  }
  const distribution = buildDistribution(slots);

  /* --- 3. Restriction filtering ----------------------------------- */
  const { allowed, rejections } = filterFoods(FOOD_DATABASE, profile);
  const excluded = new Set(options.excludeFoodIds ?? []);
  const pool = allowed.filter((food) => !excluded.has(food.id));

  if (pool.length === 0) {
    return {
      success: false,
      reason: "INSUFFICIENT_OPTIONS",
      message:
        "There are not enough suitable meals matching your current restrictions.",
      details: summariseRejections(rejections),
      offendingFoodIds: [],
    };
  }

  /* --- 4. Build each meal ----------------------------------------- */
  const seed = options.variationSeed ?? Math.floor(Math.random() * 1_000_000) + 1;
  const random = createRandom(seed);
  const habitFoods = collectHabitFoods(profile);

  // Part 11 — optional dataset signal. With no dataset loaded this returns
  // the neutral signal and every candidate scores a constant 0.5, so the
  // engine behaves exactly as it did before the dataset layer existed.
  const datasetSignal = getDatasetSignal(profile);
  const datasetFitFor = datasetSignal.available
    ? (food: FoodItemRecord) =>
        datasetPreferenceSignal(datasetSignal, food.name, food.ingredients)
    : undefined;

  const usedFoodIds = new Set<string>();
  const usedIngredients = new Set<string>();
  const meals: PlannedMeal[] = [];
  const emptySlots: PlannerSlot[] = [];

  for (const slot of slots) {
    const share = distribution[slot] ?? 0;
    const slotCalories = targetCalories * share;
    const slotProtein = targetProtein * share;

    const allCandidates = foodsForCategory(pool, SLOT_CATEGORY[slot]);
    if (allCandidates.length === 0) {
      emptySlots.push(slot);
      continue;
    }

    // Practical constraint: when the user stated a preparation-time limit,
    // restrict to dishes that fit it — but only while enough choice remains,
    // so a tight limit narrows the plan instead of breaking it.
    const prepLimit =
      PREP_TIME_LIMITS[profile.practicalConstraints.mealPreparationTime] ?? null;
    const withinPrepLimit =
      prepLimit === null
        ? allCandidates
        : allCandidates.filter(
            (food) => food.preparationTimeMinutes <= prepLimit,
          );
    const candidates =
      withinPrepLimit.length >= 2 ? withinPrepLimit : allCandidates;

    const preferTags = options.preferTags ?? [];
    const tagBoost = (food: FoodItemRecord) =>
      (preferTags.length > 0 && preferTags.some((tag) => food.tags.includes(tag))
        ? PREFERRED_TAG_BOOST
        : 0) + pantryBoost(food, options.preferIngredients);
    const ranked = candidates
      .map((food) => ({
        food,
        score: scoreFood(food, {
          slotCalories,
          slotProtein,
          profile,
          habitFoods,
          usedFoodIds,
          usedIngredients,
          datasetFitFor,
        }),
        boost: tagBoost(food),
      }))
      .sort((a, b) => b.score.total + b.boost - (a.score.total + a.boost));

    // Controlled variation: choose among the best few, never at random
    // from the whole pool, so quality stays high while plans differ.
    const poolSize = Math.min(CANDIDATE_POOL_SIZE, ranked.length);
    const chosen = ranked[Math.floor(random() * poolSize)] ?? ranked[0];
    const food = chosen.food;

    const servings = chooseServings(food, slotCalories);
    const item = buildPlannedItem(food, servings);

    usedFoodIds.add(food.id);
    food.ingredients.forEach((ingredient) => usedIngredients.add(ingredient));

    const userTime = profile.mealTimings[slot];
    meals.push(
      mealFromItems(
        slot,
        [item],
        userTime || DEFAULT_MEAL_TIMES[slot],
        share,
        buildMealNote(food, profile),
      ),
    );
  }

  if (meals.length === 0) {
    return {
      success: false,
      reason: "INSUFFICIENT_OPTIONS",
      message:
        "No compatible meals could be found for any part of your day with the current restrictions.",
      details: summariseRejections(rejections),
      offendingFoodIds: [],
    };
  }

  /* --- 5. Balance the day towards the calorie target --------------- */
  balancePlan(meals, targetCalories, pool);

  /* --- 6. Totals are computed FROM the meals, never copied ---------- */
  const dailyTotals = {
    calories: Math.round(meals.reduce((sum, m) => sum + m.calories, 0)),
    protein: roundTo(meals.reduce((sum, m) => sum + m.proteinGrams, 0), 1),
    carbohydrates: roundTo(
      meals.reduce((sum, m) => sum + m.carbohydrateGrams, 0),
      1,
    ),
    fat: roundTo(meals.reduce((sum, m) => sum + m.fatGrams, 0), 1),
  };

  const plan: DietPlan = {
    id: createId("plan"),
    dietPlanVersion: CURRENT_DIET_PLAN_VERSION,
    generatedAt: new Date().toISOString(),
    sourceProfileId: profile.profileId,
    sourceProfileUpdatedAt: profile.updatedAt,
    processedAt: processed.processedAt,
    variationSeed: seed,
    summary: {
      goal: processed.goal,
      dietaryType: profile.dietaryPreferences.dietaryType
        ? {
            id: profile.dietaryPreferences.dietaryType,
            label: labelFor(DIETARY_TYPES, profile.dietaryPreferences.dietaryType),
          }
        : null,
      targetCalories,
      targetProtein,
      targetCarbohydrates: targetCarbs,
      targetFat,
    },
    meals,
    dailyTotals,
    personalisationFactors: [
      ...describePersonalisation(profile, processed),
      ...(datasetSignal.available
        ? [`Reference-dataset signal from ${datasetSignal.sampleSize} similar participant record(s) (auxiliary only)`]
        : []),
    ],
    recommendations: buildRecommendations(profile, processed, dailyTotals),
    validation: {
      isValid: true,
      errors: [],
      warnings: [],
      checks: {
        allergies: "not_applicable",
        intolerances: "not_applicable",
        dietaryType: "not_applicable",
        foodsToAvoid: "not_applicable",
        mealStructure: "passed",
        nutrition: "passed",
      },
      attempts: 1,
    },
  };

  if (emptySlots.length > 0) {
    plan.validation.warnings.push(
      `No compatible options were available for: ${emptySlots
        .map((slot) => mealLabel(slot))
        .join(", ")}.`,
    );
  }

  /* --- 7a. Not enough compatible food to build a usable day? -------- */
  // Distinguish "your restrictions left too little to work with" from a
  // genuine validation bug, so the user gets an actionable message.
  const severeShortfall =
    dailyTotals.calories < targetCalories * (1 - PLAN_TOLERANCES.calorieHardPercent);
  if (emptySlots.length > 0 || severeShortfall) {
    if (emptySlots.length >= slots.length / 2 || severeShortfall) {
      return {
        success: false,
        reason: "INSUFFICIENT_OPTIONS",
        message:
          "Your current selections leave too few compatible meal options to build a balanced day.",
        details: [
          ...summariseRejections(rejections),
          "Try reviewing your restrictions or adding more preferred foods.",
        ],
        offendingFoodIds: [],
      };
    }
  }

  /* --- 7b. Independent final safety validation ---------------------- */
  const validation = validateGeneratedDietPlan(plan, profile);
  plan.validation = {
    isValid: validation.isValid,
    errors: validation.errors,
    warnings: [...plan.validation.warnings, ...validation.warnings],
    checks: validation.checks,
    attempts: 1,
  };

  if (!validation.isValid) {
    // Report which foods caused the failure so the caller can exclude
    // them and retry — the plan itself is discarded, never displayed.
    const offendingFoodIds = plan.meals
      .filter((meal) => validation.failedMealIds.includes(meal.id))
      .flatMap((meal) => meal.items.map((item) => item.foodId));

    return {
      success: false,
      reason: "VALIDATION_FAILED",
      message:
        "The generated plan did not pass the final safety check, so it was discarded.",
      details: validation.errors,
      offendingFoodIds,
    };
  }

  return { success: true, plan };
}

/** Convenience wrapper used by the "Regenerate" action. */
export function regenerateDietPlan(
  profile: UserProfile,
  processed: ProcessedProfile | null,
  previous: DietPlan | null,
): GenerationResult {
  const seed = Math.floor(Math.random() * 1_000_000) + 1;
  // Nudge the engine away from the previous main dishes so the new plan
  // genuinely differs, while every restriction still applies.
  const previousMains = (previous?.meals ?? [])
    .flatMap((meal) => meal.items.map((item) => item.foodId))
    .slice(0, 3);

  const result = generateDietPlan(profile, processed, {
    variationSeed: seed,
    excludeFoodIds: previousMains,
  });

  // If excluding them leaves too little choice, retry without exclusions
  // rather than returning a failure or an unsafe fallback.
  if (!result.success && result.reason === "INSUFFICIENT_OPTIONS") {
    return generateDietPlan(profile, processed, { variationSeed: seed });
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Nudges portion sizes so the daily total approaches the calorie target.
 * Only scales within each food's realistic bounds — the engine will
 * accept a small shortfall rather than serve an absurd portion.
 */
function balancePlan(
  meals: PlannedMeal[],
  targetCalories: number,
  pool: FoodItemRecord[],
): void {
  const byId = new Map(pool.map((food) => [food.id, food]));

  for (let pass = 0; pass < 3; pass += 1) {
    const total = meals.reduce((sum, meal) => sum + meal.calories, 0);
    const gap = targetCalories - total;
    if (Math.abs(gap) <= targetCalories * PLAN_TOLERANCES.caloriePercent * 0.5) {
      return;
    }

    // Spread the gap proportionally across the meals we can still scale.
    let adjusted = false;
    for (const meal of meals) {
      const share = meal.targetShare || 1 / meals.length;
      const mealGap = gap * share;

      for (const item of meal.items) {
        const food = byId.get(item.foodId);
        if (!food || food.calories <= 0) continue;

        const desiredCalories = item.calories + mealGap;
        const next = chooseServings(food, desiredCalories);
        if (next === item.servings) continue;

        const updated = buildPlannedItem(food, next);
        Object.assign(item, updated);
        adjusted = true;
      }

      const sum = (pick: (item: PlannedFoodItem) => number) =>
        meal.items.reduce((t, item) => t + pick(item), 0);
      meal.calories = Math.round(sum((item) => item.calories));
      meal.proteinGrams = roundTo(sum((item) => item.proteinGrams), 1);
      meal.carbohydrateGrams = roundTo(sum((item) => item.carbohydrateGrams), 1);
      meal.fatGrams = roundTo(sum((item) => item.fatGrams), 1);
    }

    if (!adjusted) return;
  }
}

function buildMealNote(food: FoodItemRecord, profile: UserProfile): string {
  const notes: string[] = [];
  if (
    profile.practicalConstraints.mealPreparationTime === "very_little" &&
    food.preparationTimeMinutes <= 12
  ) {
    notes.push("Chosen as a quick option to suit your limited preparation time.");
  }
  const matchedCuisine = profile.dietaryPreferences.preferredCuisines.find(
    (cuisine) => food.cuisines.includes(cuisine),
  );
  if (matchedCuisine) notes.push("Matches one of your preferred cuisines.");
  return notes.join(" ");
}

function summariseRejections(
  rejections: { reason: string; detail: string }[],
): string[] {
  const counts = new Map<string, number>();
  for (const rejection of rejections) {
    counts.set(rejection.reason, (counts.get(rejection.reason) ?? 0) + 1);
  }
  const labels: Record<string, string> = {
    allergy: "excluded because of a declared allergy",
    intolerance: "excluded because of a declared intolerance",
    dietary_type: "excluded by your dietary pattern",
    food_to_avoid: "excluded because you asked to avoid them",
  };
  return Array.from(counts.entries()).map(
    ([reason, count]) => `${count} option(s) ${labels[reason] ?? reason}.`,
  );
}
