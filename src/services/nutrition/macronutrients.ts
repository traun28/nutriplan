/**
 * Part 6 — macronutrient targets.
 *
 * Order of allocation:
 *   1. Protein  — body-weight based, adjusted by goal (g/kg).
 *   2. Fat      — a share of daily calories (default 25%).
 *   3. Carbs    — whatever calories remain.
 *
 * Conversions use the Atwater factors in constants.ts
 * (protein 4 kcal/g, carbohydrate 4 kcal/g, fat 9 kcal/g).
 */
import type { Goal, MacronutrientResult, TargetSource } from "@/types/profile";
import {
  FAT_SHARE_OF_CALORIES,
  GOAL_ADJUSTMENTS,
  MACRO_CALORIES_PER_GRAM,
  MAX_PROTEIN_FAT_SHARE,
  MIN_FAT_SHARE_OF_CALORIES,
} from "@/services/nutrition/constants";
import { roundTo } from "@/lib/numbers";

export interface ProteinEstimate {
  grams: number;
  gramsPerKg: number;
}

/** Protein target = body weight (kg) × goal-specific g/kg assumption. */
export function calculateProteinTarget(
  weightKg: number | null,
  goal: Goal | "",
): ProteinEstimate | null {
  if (weightKg === null || !Number.isFinite(weightKg) || weightKg <= 0) {
    return null;
  }
  const config = goal ? GOAL_ADJUSTMENTS[goal] : undefined;
  const gramsPerKg = config?.proteinGramsPerKg ?? 1.2;
  return { grams: roundTo(weightKg * gramsPerKg), gramsPerKg };
}

export interface MacroTargetInput {
  calories: number | null;
  proteinGrams: number | null;
  proteinSource: TargetSource;
  estimatedProteinGrams: number | null;
  userProvidedProteinGrams: number | null;
  proteinGramsPerKg: number | null;
}

export interface MacroTargetOutput {
  macros: MacronutrientResult;
  notes: string[];
}

/**
 * Distributes the selected calorie target across the three macronutrients
 * and guarantees the result is internally consistent (no negative carbs,
 * no macro set whose calories wildly exceed the target).
 */
export function calculateMacroTargets(
  input: MacroTargetInput,
): MacroTargetOutput {
  const notes: string[] = [];
  const {
    calories,
    proteinGrams,
    proteinSource,
    estimatedProteinGrams,
    userProvidedProteinGrams,
    proteinGramsPerKg,
  } = input;

  const emptyResult: MacronutrientResult = {
    protein: {
      estimatedGrams: estimatedProteinGrams,
      userProvidedGrams: userProvidedProteinGrams,
      selectedGrams: proteinGrams,
      selectedSource: proteinSource,
      gramsPerKg: proteinGramsPerKg,
    },
    carbohydrates: { grams: null, percentOfCalories: null },
    fat: { grams: null, percentOfCalories: null },
    totalMacroCalories: null,
  };

  if (
    calories === null ||
    !Number.isFinite(calories) ||
    calories <= 0 ||
    proteinGrams === null ||
    !Number.isFinite(proteinGrams)
  ) {
    return { macros: emptyResult, notes };
  }

  const proteinCalories = proteinGrams * MACRO_CALORIES_PER_GRAM.protein;
  let fatCalories = calories * FAT_SHARE_OF_CALORIES;

  // Guardrail: protein + fat must leave room for carbohydrates.
  const maxProteinFatCalories = calories * MAX_PROTEIN_FAT_SHARE;
  if (proteinCalories + fatCalories > maxProteinFatCalories) {
    fatCalories = Math.max(
      calories * MIN_FAT_SHARE_OF_CALORIES,
      maxProteinFatCalories - proteinCalories,
    );
    notes.push(
      "Fat was reduced towards its minimum share so the protein target still fits inside the calorie target.",
    );
  }

  let carbCalories = calories - proteinCalories - fatCalories;
  if (carbCalories < 0) {
    carbCalories = 0;
    notes.push(
      "Your protein target already uses the whole calorie budget, so no carbohydrate allowance could be calculated. Please review your targets.",
    );
  }

  const fatGrams = roundTo(fatCalories / MACRO_CALORIES_PER_GRAM.fat);
  const carbGrams = roundTo(
    carbCalories / MACRO_CALORIES_PER_GRAM.carbohydrate,
  );

  const totalMacroCalories = roundTo(
    proteinGrams * MACRO_CALORIES_PER_GRAM.protein +
      carbGrams * MACRO_CALORIES_PER_GRAM.carbohydrate +
      fatGrams * MACRO_CALORIES_PER_GRAM.fat,
  );

  return {
    notes,
    macros: {
      protein: {
        estimatedGrams: estimatedProteinGrams,
        userProvidedGrams: userProvidedProteinGrams,
        selectedGrams: roundTo(proteinGrams),
        selectedSource: proteinSource,
        gramsPerKg: proteinGramsPerKg,
      },
      carbohydrates: {
        grams: carbGrams,
        percentOfCalories: roundTo((carbCalories / calories) * 100),
      },
      fat: {
        grams: fatGrams,
        percentOfCalories: roundTo((fatCalories / calories) * 100),
      },
      totalMacroCalories,
    },
  };
}

/** Percentage of the calorie target supplied by protein. */
export function proteinPercentOfCalories(
  proteinGrams: number | null,
  calories: number | null,
): number | null {
  if (
    proteinGrams === null ||
    calories === null ||
    !Number.isFinite(proteinGrams) ||
    !Number.isFinite(calories) ||
    calories <= 0
  ) {
    return null;
  }
  return roundTo(
    ((proteinGrams * MACRO_CALORIES_PER_GRAM.protein) / calories) * 100,
  );
}
