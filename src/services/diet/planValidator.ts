/**
 * Part 7 — independent final safety validator.
 *
 * This runs AFTER generation and deliberately repeats the restriction
 * checks from scratch against the finished plan. If the filter stage
 * ever had a bug, this catches it and the plan is discarded rather than
 * being shown with a warning.
 *
 * A plan that meets its calorie target but breaks a dietary restriction
 * is INVALID, not "valid with a note".
 */
import type { DietPlan, UserProfile } from "@/types/profile";
import { FOOD_BY_ID } from "@/data/foods/foodDatabase";
import { allergenLabel, mealLabel } from "@/data/options";
import {
  violatesAllergy,
  violatesDietaryType,
  violatesFoodsToAvoid,
  violatesIntolerance,
} from "@/services/diet/filters";
import { PLAN_TOLERANCES, PORTION_BOUNDS } from "@/services/diet/config";
import { roundTo } from "@/lib/numbers";

/** Result of one named safety check. */
export type CheckOutcome = "passed" | "failed" | "not_applicable";

export interface PlanChecks {
  allergies: CheckOutcome;
  intolerances: CheckOutcome;
  dietaryType: CheckOutcome;
  foodsToAvoid: CheckOutcome;
  mealStructure: CheckOutcome;
  nutrition: CheckOutcome;
}

export interface PlanValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  /** Per-category report, surfaced on the dashboard as a safety summary. */
  checks: PlanChecks;
  /** Meal ids that failed a restriction check — used by the repair pass. */
  failedMealIds: string[];
}

export function validateGeneratedDietPlan(
  plan: DietPlan,
  profile: UserProfile,
): PlanValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const failedMealIds = new Set<string>();

  const allergyFailures: string[] = [];
  const intoleranceFailures: string[] = [];
  const dietFailures: string[] = [];
  const avoidFailures: string[] = [];
  const structureFailures: string[] = [];
  const nutritionFailures: string[] = [];

  /* ---------------------- structural checks ---------------------- */
  if (plan.meals.length === 0) {
    structureFailures.push("The generated plan contains no meals.");
  }
  if (plan.sourceProfileId !== profile.profileId) {
    structureFailures.push("The plan does not belong to the current profile.");
  }

  const allergies = profile.allergies.filter((entry) => entry !== "none");
  const dietaryType = profile.dietaryPreferences.dietaryType;

  /* ------------- per-meal, per-item, per-ingredient -------------- */
  for (const meal of plan.meals) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(meal.time)) {
      structureFailures.push(`${meal.label} has an invalid time (${meal.time}).`);
      failedMealIds.add(meal.id);
    }
    if (meal.items.length === 0) {
      structureFailures.push(`${meal.label} has no food items.`);
      failedMealIds.add(meal.id);
      continue;
    }

    for (const item of meal.items) {
      const food = FOOD_BY_ID.get(item.foodId);
      if (!food) {
        structureFailures.push(`${meal.label} references an unknown food item.`);
        failedMealIds.add(meal.id);
        continue;
      }

      // Restrictions re-checked from the raw database record.
      const allergen = violatesAllergy(food, allergies);
      if (allergen) {
        allergyFailures.push(
          `${meal.label}: “${food.name}” conflicts with your ${allergenLabel(
            allergen,
          )} allergy.`,
        );
        failedMealIds.add(meal.id);
      }

      const intolerance = violatesIntolerance(food, profile.intolerances);
      if (intolerance) {
        intoleranceFailures.push(
          `${meal.label}: “${food.name}” conflicts with your ${intolerance} intolerance.`,
        );
        failedMealIds.add(meal.id);
      }

      if (violatesDietaryType(food, dietaryType)) {
        dietFailures.push(
          `${meal.label}: “${food.name}” does not match your ${dietaryType.replace(
            /_/g,
            "-",
          )} dietary pattern.`,
        );
        failedMealIds.add(meal.id);
      }

      const avoided = violatesFoodsToAvoid(food, profile.foodsToAvoid);
      if (avoided) {
        avoidFailures.push(
          `${meal.label}: “${food.name}” contains ${avoided}, which you asked to avoid.`,
        );
        failedMealIds.add(meal.id);
      }

      // Portion sanity.
      if (
        item.servings < PORTION_BOUNDS.min - 0.001 ||
        item.servings > PORTION_BOUNDS.max + 0.001
      ) {
        structureFailures.push(
          `${meal.label}: the portion for “${food.name}” is outside a realistic range.`,
        );
        failedMealIds.add(meal.id);
      }

      // Nutrition sanity.
      const numbers = [
        item.calories,
        item.proteinGrams,
        item.carbohydrateGrams,
        item.fatGrams,
      ];
      if (numbers.some((value) => !Number.isFinite(value) || value < 0)) {
        structureFailures.push(
          `${meal.label}: “${food.name}” has invalid nutrition values.`,
        );
        failedMealIds.add(meal.id);
      }
    }

    // A meal marked as skipped must never appear in the plan.
    if (profile.foodIntake[meal.type]?.hasMeal === false) {
      structureFailures.push(
        `${mealLabel(meal.type)} was planned even though you marked it as skipped.`,
      );
      failedMealIds.add(meal.id);
    }
  }

  /* -------------------- nutrition alignment ---------------------- */
  const { targetCalories, targetProtein } = plan.summary;
  const { calories, protein, carbohydrates, fat } = plan.dailyTotals;

  if (!Number.isFinite(calories) || calories <= 0) {
    nutritionFailures.push("The planned daily calories could not be calculated.");
  } else if (targetCalories > 0) {
    const drift = Math.abs(calories - targetCalories) / targetCalories;
    if (drift > PLAN_TOLERANCES.calorieHardPercent) {
      nutritionFailures.push(
        `Planned calories (${calories}) are too far from your target (${targetCalories}).`,
      );
    } else if (drift > PLAN_TOLERANCES.caloriePercent) {
      warnings.push(
        `Planned calories are ${
          calories > targetCalories ? "above" : "below"
        } your target by about ${Math.round(drift * 100)}%.`,
      );
    }
  }

  if (targetProtein > 0 && Number.isFinite(protein)) {
    const drift = Math.abs(protein - targetProtein) / targetProtein;
    if (drift > PLAN_TOLERANCES.proteinPercent) {
      warnings.push(
        `Planned protein (${roundTo(protein)} g) differs from your target (${roundTo(
          targetProtein,
        )} g).`,
      );
    }
  }

  if (carbohydrates < 0 || fat < 0) {
    nutritionFailures.push("The plan produced impossible macronutrient totals.");
  }

  /* ------------------------- assemble report ---------------------- */
  // A check is "not applicable" when the user declared nothing to check.
  const outcome = (failures: string[], applicable: boolean): CheckOutcome =>
    !applicable ? "not_applicable" : failures.length === 0 ? "passed" : "failed";

  const checks: PlanChecks = {
    allergies: outcome(allergyFailures, allergies.length > 0),
    intolerances: outcome(intoleranceFailures, profile.intolerances.length > 0),
    dietaryType: outcome(dietFailures, Boolean(dietaryType)),
    foodsToAvoid: outcome(avoidFailures, profile.foodsToAvoid.length > 0),
    mealStructure: outcome(structureFailures, true),
    nutrition: outcome(nutritionFailures, true),
  };

  errors.push(
    ...allergyFailures,
    ...intoleranceFailures,
    ...dietFailures,
    ...avoidFailures,
    ...structureFailures,
    ...nutritionFailures,
  );

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    checks,
    failedMealIds: Array.from(failedMealIds),
  };
}

// Freshness lives in a dependency-free module so the root layout does not
// bundle the food database. Re-exported here for backwards compatibility.
export { isDietPlanCurrent } from "@/lib/freshness";
