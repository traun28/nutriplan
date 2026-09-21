/**
 * Part 7 — builds the dynamic "why this plan is personalised" list.
 *
 * Every entry is derived from the user's actual profile, so two users
 * never see the same list. Nothing here is a static marketing sentence.
 */
import type { ProcessedProfile, UserProfile } from "@/types/profile";
import {
  ACTIVITY_LEVELS,
  allergenLabel,
  CUISINES,
  DIETARY_TYPES,
  formatTime,
  intoleranceLabel,
  labelFor,
  MEAL_PREP_TIME_OPTIONS,
  mealLabel,
} from "@/data/options";
import { titleCase } from "@/lib/normalize";
import { MEAL_IDS } from "@/types/profile";

export function describePersonalisation(
  profile: UserProfile,
  processed: ProcessedProfile,
): string[] {
  const factors: string[] = [];

  if (processed.goal) {
    factors.push(`Your ${processed.goal.label.toLowerCase()} goal`);
  }

  if (profile.dietaryPreferences.dietaryType) {
    factors.push(
      `${labelFor(DIETARY_TYPES, profile.dietaryPreferences.dietaryType)} dietary pattern`,
    );
  }

  const realAllergies = profile.allergies.filter((entry) => entry !== "none");
  if (realAllergies.length > 0) {
    factors.push(
      `${realAllergies.map(allergenLabel).join(", ")} excluded as declared ${
        realAllergies.length === 1 ? "allergy" : "allergies"
      }`,
    );
  }

  if (profile.intolerances.length > 0) {
    factors.push(
      `${profile.intolerances.map(intoleranceLabel).join(", ")} intolerance handling`,
    );
  }

  if (profile.foodsToAvoid.length > 0) {
    factors.push(
      `Foods you asked to avoid: ${profile.foodsToAvoid.map(titleCase).join(", ")}`,
    );
  }

  if (profile.preferredFoods.length > 0) {
    factors.push(
      `Preference for ${profile.preferredFoods.slice(0, 4).map(titleCase).join(", ")}`,
    );
  }

  if (profile.dietaryPreferences.preferredCuisines.length > 0) {
    factors.push(
      `${profile.dietaryPreferences.preferredCuisines
        .map((id) => labelFor(CUISINES, id))
        .join(", ")} cuisine preference`,
    );
  }

  if (processed.activity) {
    factors.push(`${processed.activity.label} activity level`);
  } else if (profile.personalDetails.activityLevel) {
    factors.push(
      `${labelFor(ACTIVITY_LEVELS, profile.personalDetails.activityLevel)} activity level`,
    );
  }

  if (processed.energy.selectedCalories !== null) {
    factors.push(
      `${processed.energy.selectedCalories.toLocaleString()} kcal ${
        processed.energy.selectedSource === "user"
          ? "target you provided"
          : "estimated daily target"
      }`,
    );
  }

  const statedTimes = MEAL_IDS.filter((slot) => profile.mealTimings[slot]);
  if (statedTimes.length > 0) {
    const first = statedTimes[0];
    factors.push(
      `Your own meal timings (e.g. ${mealLabel(first)} at ${formatTime(
        profile.mealTimings[first],
      )})`,
    );
  }

  const skipped = MEAL_IDS.filter(
    (slot) => profile.foodIntake[slot]?.hasMeal === false,
  );
  if (skipped.length > 0) {
    factors.push(
      `Meals you usually skip were left out: ${skipped.map(mealLabel).join(", ")}`,
    );
  }

  if (profile.practicalConstraints.mealPreparationTime) {
    factors.push(
      `Preparation time available: ${labelFor(
        MEAL_PREP_TIME_OPTIONS,
        profile.practicalConstraints.mealPreparationTime,
      ).toLowerCase()}`,
    );
  }

  if (profile.mealHabits.mealsPerDay !== null) {
    factors.push(
      `Your usual eating pattern of ${
        profile.mealHabits.mealsPerDay >= 7
          ? "more than 6"
          : profile.mealHabits.mealsPerDay
      } meals a day`,
    );
  }

  return factors;
}
