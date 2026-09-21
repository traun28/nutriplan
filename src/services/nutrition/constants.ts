/**
 * Part 6 — every numerical assumption used by the nutrition engine.
 *
 * All "magic numbers" live here so they can be explained in one place
 * during the project viva and changed without hunting through components.
 *
 * IMPORTANT: these are general educational planning estimates, not
 * medical prescriptions.
 */
import type { ActivityLevel, Goal } from "@/types/profile";

/* ------------------------------------------------------------------ */
/* Energy content of macronutrients (Atwater factors)                  */
/* ------------------------------------------------------------------ */

export const MACRO_CALORIES_PER_GRAM = {
  protein: 4,
  carbohydrate: 4,
  fat: 9,
} as const;

/* ------------------------------------------------------------------ */
/* BMI                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Conventional adult BMI screening thresholds (WHO general categories).
 * These are screening ranges, NOT a diagnosis.
 */
export const BMI_THRESHOLDS = {
  underweight: 18.5,
  overweight: 25,
  obesity: 30,
} as const;

/* ------------------------------------------------------------------ */
/* Resting energy — Mifflin-St Jeor                                    */
/* ------------------------------------------------------------------ */

/**
 * BMR = 10·weight(kg) + 6.25·height(cm) − 5·age(years) + c
 *
 * where c = +5 (male) or −161 (female).
 *
 * For "Other" / "Prefer not to say" the application does NOT assume a
 * sex. It uses the midpoint of the two published constants
 * ((+5 + −161) / 2 = −78) and clearly labels the result as a neutral
 * approximation in `calculationNotes`.
 */
export const MIFFLIN = {
  weightFactor: 10,
  heightFactor: 6.25,
  ageFactor: 5,
  constantMale: 5,
  constantFemale: -161,
  constantNeutral: (5 + -161) / 2,
} as const;

/* ------------------------------------------------------------------ */
/* Activity factors                                                    */
/* ------------------------------------------------------------------ */

/** Standard Harris-Benedict style activity multipliers. */
export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  extremely_active: 1.9,
};

/* ------------------------------------------------------------------ */
/* Goal adjustments                                                    */
/* ------------------------------------------------------------------ */

export interface GoalConfig {
  /** Fraction applied to maintenance energy, e.g. -0.15 = 15% below. */
  calorieAdjustment: number;
  /** Protein planning assumption in grams per kg of body weight. */
  proteinGramsPerKg: number;
  description: string;
}

/**
 * Conservative, deliberately modest adjustments. Nothing here is intended
 * to produce aggressive deficits or surpluses.
 */
export const GOAL_ADJUSTMENTS: Record<Goal, GoalConfig> = {
  weight_loss: {
    calorieAdjustment: -0.15,
    proteinGramsPerKg: 1.6,
    description: "About 15% below your estimated maintenance energy.",
  },
  weight_maintenance: {
    calorieAdjustment: 0,
    proteinGramsPerKg: 1.2,
    description: "Matches your estimated maintenance energy.",
  },
  weight_gain: {
    calorieAdjustment: 0.12,
    proteinGramsPerKg: 1.6,
    description: "About 12% above your estimated maintenance energy.",
  },
  muscle_gain: {
    calorieAdjustment: 0.1,
    proteinGramsPerKg: 1.8,
    description:
      "About 10% above maintenance, with a higher protein allowance.",
  },
  general_health: {
    calorieAdjustment: 0,
    proteinGramsPerKg: 1.2,
    description: "Matches your estimated maintenance energy.",
  },
  improve_eating_habits: {
    calorieAdjustment: 0,
    proteinGramsPerKg: 1.2,
    description: "Matches your estimated maintenance energy.",
  },
};

/* ------------------------------------------------------------------ */
/* Macronutrient distribution                                          */
/* ------------------------------------------------------------------ */

/** Share of daily calories allocated to fat before carbohydrates. */
export const FAT_SHARE_OF_CALORIES = 0.25;

/** Fat is never squeezed below this share when protein is very high. */
export const MIN_FAT_SHARE_OF_CALORIES = 0.15;

/** Protein + fat are not allowed to consume the entire calorie budget. */
export const MAX_PROTEIN_FAT_SHARE = 0.95;

/* ------------------------------------------------------------------ */
/* Software sanity guardrails (NOT medical safety guarantees)          */
/* ------------------------------------------------------------------ */

export const CALORIE_GUARDRAILS = {
  /** Absolute floor for any generated target. */
  absoluteMin: 1200,
  /** Absolute ceiling for any generated target. */
  absoluteMax: 5000,
  /** A target is never placed below the estimated resting energy. */
  neverBelowRestingEnergy: true,
  /** A target is never placed above this multiple of maintenance. */
  maxMultipleOfMaintenance: 1.5,
} as const;
