/**
 * Part 7 — every tunable value used by the diet-generation engine.
 *
 * Centralised so the algorithm can be explained and adjusted in one
 * place, and so no percentage or weight is buried inside a component.
 */
import type { FoodCategory, MealId } from "@/types/profile";

/* ------------------------------------------------------------------ */
/* Meal slots                                                          */
/* ------------------------------------------------------------------ */

/** Maps a profile meal slot to the matching food-database category. */
export const SLOT_CATEGORY: Record<
  Exclude<MealId, "otherSnacks">,
  FoodCategory
> = {
  breakfast: "breakfast",
  morningSnack: "morning_snack",
  lunch: "lunch",
  eveningSnack: "evening_snack",
  dinner: "dinner",
};

/** Fallback clock times when the user did not state their own. */
export const DEFAULT_MEAL_TIMES: Record<Exclude<MealId, "otherSnacks">, string> = {
  breakfast: "08:00",
  morningSnack: "11:00",
  lunch: "13:00",
  eveningSnack: "17:00",
  dinner: "20:00",
};

export type PlannerSlot = Exclude<MealId, "otherSnacks">;

export const SLOT_ORDER: PlannerSlot[] = [
  "breakfast",
  "morningSnack",
  "lunch",
  "eveningSnack",
  "dinner",
];

/* ------------------------------------------------------------------ */
/* Calorie distribution templates                                      */
/* ------------------------------------------------------------------ */

/**
 * Share of the daily calorie target allocated to each slot.
 * Templates are keyed by how many slots the plan actually uses, so the
 * engine adapts to the user's meal frequency instead of forcing 5 meals.
 * These are planning heuristics, not medical requirements.
 */
export const DISTRIBUTION_TEMPLATES: Record<number, Partial<Record<PlannerSlot, number>>> = {
  2: { lunch: 0.55, dinner: 0.45 },
  3: { breakfast: 0.3, lunch: 0.4, dinner: 0.3 },
  4: { breakfast: 0.27, lunch: 0.35, eveningSnack: 0.1, dinner: 0.28 },
  5: {
    breakfast: 0.25,
    morningSnack: 0.08,
    lunch: 0.32,
    eveningSnack: 0.08,
    dinner: 0.27,
  },
};

/* ------------------------------------------------------------------ */
/* Tolerances                                                          */
/* ------------------------------------------------------------------ */

export const PLAN_TOLERANCES = {
  /** Daily calories must land within ±10% of the target to be "on target". */
  caloriePercent: 0.1,
  /** Hard bound — outside this the plan is rejected as invalid. */
  calorieHardPercent: 0.2,
  /** Protein within ±20% of target is acceptable. */
  proteinPercent: 0.2,
  /** Carbohydrate / fat are softer targets. */
  macroPercent: 0.3,
} as const;

/** Portion scaling is clamped globally as well as per food item. */
export const PORTION_BOUNDS = {
  min: 0.5,
  max: 2,
  /** Servings are rounded to this step so portions stay realistic. */
  step: 0.25,
} as const;

/* ------------------------------------------------------------------ */
/* Scoring weights                                                     */
/* ------------------------------------------------------------------ */

/**
 * Relative importance of each scoring signal. Restrictions are NOT part
 * of scoring — unsafe candidates are removed by the filter stage before
 * anything is scored, so no preference score can reintroduce them.
 */
export const SCORE_WEIGHTS = {
  calorieFit: 3,
  proteinFit: 2,
  goalFit: 1.5,
  preferredFood: 2,
  cuisineFit: 1.5,
  habitFit: 1.5,
  practicality: 1.5,
  /**
   * Part 11 — optional dataset-derived signal. It ranks BELOW every user
   * preference and far below the restriction filters, and is deliberately
   * the lightest weighting so reference data can only nudge a plan, never
   * drive it. When no dataset is loaded the signal is a constant 0.5, which
   * cannot reorder candidates — generation is then provably unchanged.
   */
  datasetSignal: 0.5,
  variety: 1,
} as const;

/** How many of the best-scoring candidates the engine picks between. */
export const CANDIDATE_POOL_SIZE = 4;

/* ------------------------------------------------------------------ */
/* Goal-specific ranking hints                                         */
/* ------------------------------------------------------------------ */

/**
 * Tags that earn a bonus for each goal. This is how the goal changes the
 * *kind* of meals chosen, on top of the Part 6 calorie target.
 */
export const GOAL_TAG_PREFERENCES: Record<string, string[]> = {
  weight_loss: ["light", "high_fiber", "high_protein"],
  weight_maintenance: ["homemade", "high_fiber"],
  weight_gain: ["filling", "high_protein"],
  muscle_gain: ["high_protein", "filling"],
  general_health: ["high_fiber", "homemade", "light"],
  improve_eating_habits: ["homemade", "high_fiber", "quick"],
};

/** Preparation-time ceilings implied by the user's practical constraints. */
export const PREP_TIME_LIMITS: Record<string, number> = {
  very_little: 12,
  ten_to_twenty: 20,
  twenty_to_forty: 40,
  more_than_forty: 120,
};
