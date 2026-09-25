/**
 * Shared profile fixtures for the planner checks
 * (`npm run test:planner`, `npm run test:flow`).
 *
 * Every fixture is built from the application's own `createEmptyProfile()`,
 * so a change to the profile shape breaks these checks instead of silently
 * drifting away from the real data model. Nothing here invents energy or
 * macro targets — the application's nutrition processor derives them.
 */
import { createEmptyProfile, type UserProfile } from "../src/types/profile";

export interface ProfileVariant {
  fullName?: string;
  age?: number;
  gender?: "male" | "female" | "other" | "prefer_not_to_say";
  heightCm?: number;
  weightKg?: number;
  activityLevel?:
    | "sedentary"
    | "lightly_active"
    | "moderately_active"
    | "very_active"
    | "extremely_active";
  goal?:
    | "weight_loss"
    | "weight_maintenance"
    | "weight_gain"
    | "muscle_gain"
    | "general_health"
    | "improve_eating_habits";
  dietaryType?: "vegetarian" | "vegan" | "non_vegetarian" | "eggetarian" | "pescatarian";
  allergies?: string[];
  intolerances?: string[];
  foodsToAvoid?: string[];
  preferredFoods?: string[];
  preferredCuisines?: string[];
  /** Explicit saved calorie target; null lets the engine calculate it. */
  dailyCalorieTarget?: number | null;
  proteinTargetGrams?: number | null;
  mealsPerDay?: number | null;
  mealPreparationTime?: "" | "very_little" | "ten_to_twenty" | "twenty_to_forty" | "more_than_forty";
  skippedMeals?: Array<"breakfast" | "morningSnack" | "lunch" | "eveningSnack" | "dinner">;
}

/** A complete, valid profile the planner can plan for. */
export function buildProfile(variant: ProfileVariant = {}): UserProfile {
  const profile = createEmptyProfile();
  const stamp = new Date().toISOString();
  profile.profileId = "fixture-profile";
  profile.createdAt = stamp;
  profile.updatedAt = stamp;

  profile.personalDetails.fullName = variant.fullName ?? "Fixture User";
  profile.personalDetails.age = variant.age ?? 30;
  profile.personalDetails.gender = variant.gender ?? "male";
  profile.personalDetails.heightCm = variant.heightCm ?? 175;
  profile.personalDetails.weightKg = variant.weightKg ?? 78;
  profile.personalDetails.activityLevel = variant.activityLevel ?? "moderately_active";

  profile.nutritionalInformation.primaryGoal = variant.goal ?? "weight_loss";
  profile.nutritionalInformation.dailyCalorieTarget = variant.dailyCalorieTarget ?? null;
  profile.nutritionalInformation.proteinTargetGrams = variant.proteinTargetGrams ?? null;

  profile.dietaryPreferences.dietaryType = variant.dietaryType ?? "non_vegetarian";
  profile.dietaryPreferences.preferredCuisines = variant.preferredCuisines ?? [];
  profile.dietaryPreferences.foodPreferenceNotes = "";

  profile.allergies = variant.allergies ?? [];
  profile.intolerances = variant.intolerances ?? [];
  profile.foodsToAvoid = variant.foodsToAvoid ?? [];
  profile.preferredFoods = variant.preferredFoods ?? [];

  profile.mealHabits.mealsPerDay = variant.mealsPerDay ?? 3;
  profile.practicalConstraints.mealPreparationTime = variant.mealPreparationTime ?? "";

  for (const meal of variant.skippedMeals ?? []) {
    profile.foodIntake[meal].hasMeal = false;
  }

  return profile;
}

/**
 * A profile the application accepts but which leaves very few compatible
 * foods — the "genuinely too restricted" case that must fail safely.
 */
export function buildExtremeRestrictionProfile(): UserProfile {
  return buildProfile({
    dietaryType: "vegan",
    allergies: [
      "milk_dairy",
      "eggs",
      "peanuts",
      "tree_nuts",
      "soy",
      "wheat",
      "gluten",
      "fish",
      "shellfish",
      "sesame",
    ],
    foodsToAvoid: [
      "rice",
      "roti",
      "chapati",
      "oats",
      "poha",
      "idli",
      "dosa",
      "quinoa",
      "banana",
      "apple",
      "spinach",
      "potato",
      "tomato",
      "rajma",
    ],
    mealsPerDay: 3,
  });
}
