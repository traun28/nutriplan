/**
 * Part 6 — energy estimation.
 *
 *  1. Resting energy (BMR)  — Mifflin-St Jeor equation.
 *  2. Maintenance energy    — BMR × activity factor.
 *  3. Goal target           — maintenance × (1 + goal adjustment), clamped
 *                             by software sanity guardrails.
 *
 * Every function is pure and returns null rather than a guessed value
 * when the required inputs are missing.
 */
import type {
  ActivityLevel,
  EnergyFormula,
  Gender,
  Goal,
} from "@/types/profile";
import {
  ACTIVITY_FACTORS,
  CALORIE_GUARDRAILS,
  GOAL_ADJUSTMENTS,
  MIFFLIN,
} from "@/services/nutrition/constants";
import { clamp, roundTo } from "@/lib/numbers";

export interface RestingEnergyInput {
  weightKg: number | null;
  heightCm: number | null;
  age: number | null;
  gender: Gender | "";
}

export interface RestingEnergyResult {
  calories: number;
  formula: EnergyFormula;
  /** True when a sex-neutral constant had to be used. */
  usedNeutralConstant: boolean;
}

/**
 * BMR = 10·weight + 6.25·height − 5·age + c
 *
 * c = +5 (male), −161 (female), or the midpoint −78 when the user chose
 * "Other" / "Prefer not to say". The application never silently assumes
 * a sex; the neutral case is reported back to the caller.
 */
export function calculateRestingEnergy(
  input: RestingEnergyInput,
): RestingEnergyResult | null {
  const { weightKg, heightCm, age, gender } = input;

  if (weightKg === null || heightCm === null || age === null) return null;
  if (
    !Number.isFinite(weightKg) ||
    !Number.isFinite(heightCm) ||
    !Number.isFinite(age)
  ) {
    return null;
  }
  if (weightKg <= 0 || heightCm <= 0 || age <= 0) return null;

  let constant: number;
  let formula: EnergyFormula;
  let usedNeutralConstant = false;

  if (gender === "male") {
    constant = MIFFLIN.constantMale;
    formula = "mifflin_st_jeor_male";
  } else if (gender === "female") {
    constant = MIFFLIN.constantFemale;
    formula = "mifflin_st_jeor_female";
  } else {
    constant = MIFFLIN.constantNeutral;
    formula = "mifflin_st_jeor_neutral";
    usedNeutralConstant = true;
  }

  const raw =
    MIFFLIN.weightFactor * weightKg +
    MIFFLIN.heightFactor * heightCm -
    MIFFLIN.ageFactor * age +
    constant;

  if (!Number.isFinite(raw) || raw <= 0) return null;

  return { calories: roundTo(raw), formula, usedNeutralConstant };
}

export interface MaintenanceEnergyResult {
  calories: number;
  activityFactor: number;
}

/** Estimated total daily energy expenditure = BMR × activity factor. */
export function calculateMaintenanceEnergy(
  restingCalories: number | null,
  activityLevel: ActivityLevel | "",
): MaintenanceEnergyResult | null {
  if (restingCalories === null || !Number.isFinite(restingCalories)) return null;
  if (!activityLevel) return null;

  const activityFactor = ACTIVITY_FACTORS[activityLevel];
  if (!activityFactor) return null;

  return {
    calories: roundTo(restingCalories * activityFactor),
    activityFactor,
  };
}

export interface GoalCaloriesResult {
  calories: number;
  adjustment: number;
  /** Populated when a guardrail changed the raw calculated value. */
  notes: string[];
}

/**
 * Applies the configured goal adjustment, then clamps the result with the
 * software guardrails so the app can never emit an absurd target.
 */
export function calculateGoalCalories(
  maintenanceCalories: number | null,
  goal: Goal | "",
  restingCalories: number | null,
): GoalCaloriesResult | null {
  if (maintenanceCalories === null || !Number.isFinite(maintenanceCalories)) {
    return null;
  }
  if (!goal) return null;

  const config = GOAL_ADJUSTMENTS[goal];
  if (!config) return null;

  const raw = maintenanceCalories * (1 + config.calorieAdjustment);
  const notes: string[] = [];

  let lowerBound: number = CALORIE_GUARDRAILS.absoluteMin;
  if (
    CALORIE_GUARDRAILS.neverBelowRestingEnergy &&
    restingCalories !== null &&
    Number.isFinite(restingCalories)
  ) {
    lowerBound = Math.max(lowerBound, restingCalories);
  }

  const upperBound = Math.min(
    CALORIE_GUARDRAILS.absoluteMax,
    maintenanceCalories * CALORIE_GUARDRAILS.maxMultipleOfMaintenance,
  );

  const clamped = clamp(raw, lowerBound, Math.max(lowerBound, upperBound));

  if (roundTo(clamped) !== roundTo(raw)) {
    notes.push(
      "The goal-based target was adjusted to stay within the application's sensible calorie range.",
    );
  }

  return {
    calories: roundTo(clamped),
    adjustment: config.calorieAdjustment,
    notes,
  };
}
