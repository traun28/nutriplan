/**
 * Part 6 — the processing engine entry point.
 *
 *   processUserProfile(profile)
 *     → validate → normalise → BMI → resting energy → maintenance energy
 *     → goal target → protein → macros → ProcessedProfile
 *
 * The function is pure apart from the `processedAt` timestamp. It NEVER
 * mutates the source profile, never touches storage and never navigates.
 *
 * User-provided targets always win over calculated estimates, and both
 * values are kept side by side so the UI can show which one is in use.
 */
import type {
  EnergyResult,
  ProcessedProfile,
  ProcessingIssue,
  ProcessingResult,
  TargetSource,
  UserProfile,
} from "@/types/profile";
import { ACTIVITY_LEVELS, GOALS, labelFor } from "@/data/options";
import { LIMITS } from "@/lib/validation";
import { calculateBmi } from "@/services/nutrition/bmi";
import {
  calculateGoalCalories,
  calculateMaintenanceEnergy,
  calculateRestingEnergy,
} from "@/services/nutrition/energy";
import {
  calculateMacroTargets,
  calculateProteinTarget,
} from "@/services/nutrition/macronutrients";
import { GOAL_ADJUSTMENTS } from "@/services/nutrition/constants";

/** A numeric field is usable only when finite and inside its limits. */
function isUsableNumber(
  value: number | null,
  min: number,
  max: number,
): value is number {
  return value !== null && Number.isFinite(value) && value >= min && value <= max;
}

export function processUserProfile(profile: UserProfile): ProcessingResult {
  const errors: ProcessingIssue[] = [];
  const notes: string[] = [];

  const { age, gender, heightCm, weightKg, activityLevel } =
    profile.personalDetails;
  const { primaryGoal, dailyCalorieTarget, proteinTargetGrams } =
    profile.nutritionalInformation;

  /* ---------------------------- validation --------------------------- */

  const heightOk = isUsableNumber(
    heightCm,
    LIMITS.heightCm.min,
    LIMITS.heightCm.max,
  );
  const weightOk = isUsableNumber(
    weightKg,
    LIMITS.weightKg.min,
    LIMITS.weightKg.max,
  );
  const ageOk = isUsableNumber(age, LIMITS.age.min, LIMITS.age.max);

  if (!heightOk) {
    errors.push({
      field: "personalDetails.heightCm",
      message: "A valid height is required to calculate BMI and energy needs.",
    });
  }
  if (!weightOk) {
    errors.push({
      field: "personalDetails.weightKg",
      message: "A valid weight is required to calculate BMI and energy needs.",
    });
  }
  if (!ageOk) {
    errors.push({
      field: "personalDetails.age",
      message: "A valid age is required to estimate your energy needs.",
    });
  }
  if (!activityLevel) {
    errors.push({
      field: "personalDetails.activityLevel",
      message: "An activity level is required to estimate your daily energy use.",
    });
  }
  if (!primaryGoal) {
    errors.push({
      field: "nutritionalInformation.primaryGoal",
      message: "A main goal is required to calculate your daily target.",
    });
  }

  /* ------------------------------- BMI ------------------------------- */

  const bmi =
    heightOk && weightOk ? calculateBmi(weightKg, heightCm) : null;

  /* -------------------------- resting energy ------------------------- */

  const resting =
    heightOk && weightOk && ageOk
      ? calculateRestingEnergy({ weightKg, heightCm, age, gender })
      : null;

  if (resting?.usedNeutralConstant) {
    notes.push(
      "You chose not to specify a sex-based parameter, so a neutral midpoint of the standard male and female constants was used. Treat this energy estimate as a broader approximation.",
    );
  }

  /* ------------------------ maintenance energy ----------------------- */

  const maintenance = calculateMaintenanceEnergy(
    resting?.calories ?? null,
    activityLevel,
  );

  /* --------------------------- goal calories ------------------------- */

  const goalCalories = calculateGoalCalories(
    maintenance?.calories ?? null,
    primaryGoal,
    resting?.calories ?? null,
  );
  if (goalCalories) notes.push(...goalCalories.notes);

  /* ---------------- calorie target priority: user > calc ------------- */

  const userCaloriesUsable = isUsableNumber(
    dailyCalorieTarget,
    LIMITS.calories.min,
    LIMITS.calories.max,
  );

  let selectedCalories: number | null = null;
  let calorieSource: TargetSource = "unavailable";

  if (userCaloriesUsable) {
    selectedCalories = dailyCalorieTarget;
    calorieSource = "user";
    notes.push(
      "You supplied a daily calorie target, so that value is being used instead of the calculated estimate.",
    );
  } else if (goalCalories) {
    selectedCalories = goalCalories.calories;
    calorieSource = "calculated";
  } else if (dailyCalorieTarget !== null && !userCaloriesUsable) {
    errors.push({
      field: "nutritionalInformation.dailyCalorieTarget",
      message:
        "Your saved calorie target is outside the supported range, so it could not be used.",
    });
  }

  const energy: EnergyResult = {
    restingEstimateCalories: resting?.calories ?? null,
    maintenanceEstimateCalories: maintenance?.calories ?? null,
    calculatedGoalCalories: goalCalories?.calories ?? null,
    userProvidedCalories: userCaloriesUsable ? dailyCalorieTarget : null,
    selectedCalories,
    selectedSource: calorieSource,
    formula: resting?.formula ?? null,
    activityFactor: maintenance?.activityFactor ?? null,
    goalAdjustment: goalCalories?.adjustment ?? null,
  };

  /* ------------------------------ protein ---------------------------- */

  const proteinEstimate = weightOk
    ? calculateProteinTarget(weightKg, primaryGoal)
    : null;

  const userProteinUsable = isUsableNumber(
    proteinTargetGrams,
    LIMITS.protein.min,
    LIMITS.protein.max,
  );

  let selectedProtein: number | null = null;
  let proteinSource: TargetSource = "unavailable";

  if (userProteinUsable) {
    selectedProtein = proteinTargetGrams;
    proteinSource = "user";
  } else if (proteinEstimate) {
    selectedProtein = proteinEstimate.grams;
    proteinSource = "calculated";
  }

  /* ------------------------------- macros ---------------------------- */

  const { macros, notes: macroNotes } = calculateMacroTargets({
    calories: selectedCalories,
    proteinGrams: selectedProtein,
    proteinSource,
    estimatedProteinGrams: proteinEstimate?.grams ?? null,
    userProvidedProteinGrams: userProteinUsable ? proteinTargetGrams : null,
    proteinGramsPerKg: proteinEstimate?.gramsPerKg ?? null,
  });
  notes.push(...macroNotes);

  if (primaryGoal && GOAL_ADJUSTMENTS[primaryGoal]) {
    notes.push(GOAL_ADJUSTMENTS[primaryGoal].description);
  }

  /* ----------------------------- assemble ---------------------------- */

  const complete =
    errors.length === 0 &&
    bmi !== null &&
    energy.selectedCalories !== null &&
    macros.carbohydrates.grams !== null;

  const processed: ProcessedProfile = {
    sourceProfileId: profile.profileId,
    sourceProfileUpdatedAt: profile.updatedAt,
    processedAt: new Date().toISOString(),
    status: complete ? "complete" : "partial",
    bmi,
    energy,
    macronutrients: macros,
    goal: primaryGoal
      ? { id: primaryGoal, label: labelFor(GOALS, primaryGoal) }
      : null,
    activity: activityLevel
      ? { id: activityLevel, label: labelFor(ACTIVITY_LEVELS, activityLevel) }
      : null,
    calculationNotes: notes,
  };

  return { success: errors.length === 0 && complete, processed, errors };
}

// Freshness lives in a dependency-free module (see lib/freshness.ts).
export { isProcessedProfileCurrent } from "@/lib/freshness";
