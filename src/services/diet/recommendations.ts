/**
 * Part 7 — general, profile-aware educational recommendations.
 *
 * These are neutral, general-nutrition statements chosen by simple rules
 * from the user's own answers. They are NOT medical advice, never
 * diagnose anything, and never promise an outcome.
 *
 * Part 9 will expand this into a fuller recommendation system.
 */
import type {
  NutritionTotals,
  ProcessedProfile,
  UserProfile,
} from "@/types/profile";
import { MEAL_IDS } from "@/types/profile";
import { mealLabel } from "@/data/options";

export function buildRecommendations(
  profile: UserProfile,
  processed: ProcessedProfile,
  totals: NutritionTotals,
): string[] {
  const tips: string[] = [];

  /* Hydration — only when the user actually told us something. */
  if (profile.waterIntake.litresPerDay !== null) {
    if (profile.waterIntake.litresPerDay < 1.5) {
      tips.push(
        `You noted about ${profile.waterIntake.litresPerDay} L of water a day. Spreading fluids across the day is a simple habit to keep in mind.`,
      );
    } else {
      tips.push(
        `You noted about ${profile.waterIntake.litresPerDay} L of water a day — keeping that steady alongside your meals is a good routine.`,
      );
    }
  } else {
    tips.push(
      "You did not record a water intake, so no hydration target is shown. You can add one in the Food Intake step.",
    );
  }

  /* Calorie alignment — neutral wording, no judgement. */
  const target = processed.energy.selectedCalories;
  if (target && target > 0) {
    const diff = Math.round(totals.calories - target);
    if (Math.abs(diff) >= 50) {
      tips.push(
        `Today's planned total is about ${Math.abs(diff)} kcal ${
          diff > 0 ? "above" : "below"
        } your estimated target. Portions can be adjusted to suit your appetite.`,
      );
    } else {
      tips.push(
        "Today's planned total sits close to your estimated daily target.",
      );
    }
  }

  /* Protein — framed around the goal the user chose. */
  const proteinTarget = processed.macronutrients.protein.selectedGrams;
  if (proteinTarget && totals.protein < proteinTarget * 0.9) {
    tips.push(
      "Adding a protein-rich item such as dal, curd, sprouts, eggs or paneer (where it suits your diet) would bring the day closer to your protein target.",
    );
  }

  /* Meal rhythm. */
  const skipped = MEAL_IDS.filter(
    (slot) => profile.foodIntake[slot]?.hasMeal === false,
  );
  if (skipped.length >= 2) {
    tips.push(
      `You usually skip ${skipped
        .map(mealLabel)
        .join(" and ")}. The plan respects that, so the remaining meals carry more of the day's energy.`,
    );
  } else {
    tips.push(
      "Keeping roughly consistent meal times each day makes a plan easier to follow.",
    );
  }

  /* Variety. */
  tips.push(
    "Including a range of vegetables, fruits and whole grains across the week supports overall variety in your diet.",
  );

  /* Practical. */
  if (profile.practicalConstraints.mealPreparationTime === "very_little") {
    tips.push(
      "Because your preparation time is limited, quicker dishes were preferred. Preparing components in advance can help on busy days.",
    );
  }

  tips.push(
    "Portion sizes are estimates. Adjust them to your own appetite and energy needs.",
  );

  return tips;
}
