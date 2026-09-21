/**
 * Part 7 — candidate scoring.
 *
 * Scoring only ever runs on foods that already passed every restriction
 * filter, so a high preference score can never reintroduce an allergen.
 *
 * Each signal returns 0..1 and is combined using the weights in
 * config.ts, giving a transparent, inspectable breakdown.
 */
import type { FoodItemRecord, UserProfile } from "@/types/profile";
import { normalizeFood } from "@/lib/normalize";
import {
  GOAL_TAG_PREFERENCES,
  PREP_TIME_LIMITS,
  SCORE_WEIGHTS,
} from "@/services/diet/config";

export interface ScoreBreakdown {
  calorieFit: number;
  proteinFit: number;
  goalFit: number;
  preferenceFit: number;
  cuisineFit: number;
  habitFit: number;
  practicalityFit: number;
  /** Part 11 — optional dataset-derived nudge (0..1, neutral = 0.5). */
  datasetFit: number;
  varietyFit: number;
  total: number;
}

export interface ScoringContext {
  /** Calorie budget for this specific meal slot. */
  slotCalories: number;
  /** Protein budget for this slot (proportional to its calorie share). */
  slotProtein: number;
  profile: UserProfile;
  /** Lowercase foods the user mentioned in their current eating habits. */
  habitFoods: string[];
  /** Ids already used elsewhere in today's plan (variety penalty). */
  usedFoodIds: Set<string>;
  /** Main ingredients already used today (repetition penalty). */
  usedIngredients: Set<string>;
  /**
   * Optional Part 11 resolver. Absent (or no dataset loaded) means every
   * candidate receives the same neutral value, so ranking is unaffected.
   */
  datasetFitFor?: (food: FoodItemRecord) => number;
}

/** 1 at a perfect match, decaying smoothly as the gap grows. */
function closeness(actual: number, target: number, tolerance: number): number {
  if (target <= 0) return 0.5;
  const gap = Math.abs(actual - target) / target;
  return Math.max(0, 1 - gap / tolerance);
}

function textMatches(food: FoodItemRecord, needle: string): boolean {
  const term = normalizeFood(needle);
  if (!term) return false;
  if (normalizeFood(food.name).includes(term)) return true;
  return food.ingredients.some((ingredient) =>
    normalizeFood(ingredient).includes(term),
  );
}

export function scoreFood(
  food: FoodItemRecord,
  context: ScoringContext,
): ScoreBreakdown {
  const { profile, slotCalories, slotProtein } = context;

  // 1. How well one standard serving fits the slot's calorie budget.
  //    Scaling happens later, so being within 2x either way is workable.
  const calorieFit = closeness(food.calories, slotCalories, 1.2);

  // 2. Protein density against this slot's protein share.
  const proteinFit =
    slotProtein > 0
      ? Math.min(1, food.proteinGrams / Math.max(1, slotProtein))
      : 0.5;

  // 3. Goal relevance, expressed through the food's tags.
  const goalTags = GOAL_TAG_PREFERENCES[profile.nutritionalInformation.primaryGoal] ?? [];
  const goalMatches = goalTags.filter((tag) => food.tags.includes(tag)).length;
  const goalFit = goalTags.length > 0 ? Math.min(1, goalMatches / 2) : 0.5;

  // 4. Explicit preferred foods.
  const preferredHits = profile.preferredFoods.filter((preferred) =>
    textMatches(food, preferred),
  ).length;
  const preferenceFit =
    profile.preferredFoods.length === 0 ? 0.5 : Math.min(1, preferredHits);

  // 5. Preferred cuisines.
  const cuisines = profile.dietaryPreferences.preferredCuisines;
  const cuisineFit =
    cuisines.length === 0
      ? 0.5
      : cuisines.some((cuisine) => food.cuisines.includes(cuisine))
        ? 1
        : 0.2;

  // 6. Similarity to what the user already eats (context, not a copy).
  const habitFit =
    context.habitFoods.length === 0
      ? 0.5
      : context.habitFoods.some((habit) => textMatches(food, habit))
        ? 1
        : 0.35;

  // 7. Practicality: preparation time against the user's stated limit.
  const limit =
    PREP_TIME_LIMITS[profile.practicalConstraints.mealPreparationTime] ?? null;
  let practicalityFit = 0.6;
  if (limit !== null) {
    practicalityFit =
      food.preparationTimeMinutes <= limit
        ? 1
        : Math.max(0, 1 - (food.preparationTimeMinutes - limit) / limit);
  }
  // Ready-to-eat preference nudges quick items up.
  if (
    profile.practicalConstraints.mealPreparationPreference === "ready_to_eat" &&
    food.tags.includes("quick")
  ) {
    practicalityFit = Math.min(1, practicalityFit + 0.2);
  }
  if (
    profile.practicalConstraints.mealPreparationPreference === "homemade" &&
    food.tags.includes("homemade")
  ) {
    practicalityFit = Math.min(1, practicalityFit + 0.2);
  }

  // 8. Dataset signal (Part 11). Neutral when unavailable.
  const datasetFit = context.datasetFitFor ? context.datasetFitFor(food) : 0.5;

  // 9. Variety: discourage repeating the same dish or protein twice a day.
  let varietyFit = 1;
  if (context.usedFoodIds.has(food.id)) varietyFit = 0;
  else {
    const overlap = food.ingredients.filter((ingredient) =>
      context.usedIngredients.has(ingredient),
    ).length;
    varietyFit = Math.max(0.2, 1 - overlap * 0.25);
  }

  const weighted =
    calorieFit * SCORE_WEIGHTS.calorieFit +
    proteinFit * SCORE_WEIGHTS.proteinFit +
    goalFit * SCORE_WEIGHTS.goalFit +
    preferenceFit * SCORE_WEIGHTS.preferredFood +
    cuisineFit * SCORE_WEIGHTS.cuisineFit +
    habitFit * SCORE_WEIGHTS.habitFit +
    practicalityFit * SCORE_WEIGHTS.practicality +
    datasetFit * SCORE_WEIGHTS.datasetSignal +
    varietyFit * SCORE_WEIGHTS.variety;

  const maxWeight = Object.values(SCORE_WEIGHTS).reduce((sum, w) => sum + w, 0);

  return {
    calorieFit,
    proteinFit,
    goalFit,
    preferenceFit,
    cuisineFit,
    habitFit,
    practicalityFit,
    datasetFit,
    varietyFit,
    total: weighted / maxWeight,
  };
}

/** Collects the foods the user described in Part 4 as habit signals. */
export function collectHabitFoods(profile: UserProfile): string[] {
  const names: string[] = [];
  for (const meal of Object.values(profile.foodIntake)) {
    for (const item of meal.items) {
      const name = normalizeFood(item.name);
      if (name) names.push(name);
    }
  }
  return Array.from(new Set(names));
}
