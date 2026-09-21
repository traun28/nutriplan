/**
 * Validation layer for the questionnaire and the storage/processing stages.
 *
 * Every validator is a pure function returning structured issues. UI
 * components decide WHEN to show them (on blur for touched fields, or for
 * everything on Continue); this module only decides WHAT is invalid.
 *
 * Reused by:
 *  - the questionnaire steps (Parts 2–4)
 *  - the Review page save action (Part 5)
 *  - the nutrition processor (Part 6)
 */
import type {
  DietaryPreferences,
  FoodIntake,
  MealId,
  NutritionalInformation,
  PersonalDetails,
  UserProfile,
} from "@/types/profile";
import { MEAL_IDS } from "@/types/profile";
import { mealLabel } from "@/data/options";

export type ErrorMap<T> = Partial<Record<keyof T, string>>;
export type PersonalDetailsErrors = ErrorMap<PersonalDetails>;
export type NutritionErrors = Partial<
  Record<
    "primaryGoal" | "dietaryType" | "dailyCalorieTarget" | "proteinTargetGrams",
    string
  >
>;

/** Sensible boundaries for a general-purpose nutrition planner. */
export const LIMITS = {
  age: { min: 10, max: 100 },
  heightCm: { min: 100, max: 230 },
  weightKg: { min: 30, max: 250 },
  calories: { min: 1000, max: 6000 },
  protein: { min: 30, max: 400 },
  quantity: { min: 0.01, max: 5000 },
  waterLitres: { min: 0.1, max: 10 },
  waterGlasses: { min: 1, max: 40 },
} as const;

/* ------------------------------------------------------------------ */
/* Part 2 — personal details                                           */
/* ------------------------------------------------------------------ */

export function validatePersonalDetails(
  details: PersonalDetails,
): PersonalDetailsErrors {
  const errors: PersonalDetailsErrors = {};

  const name = details.fullName.trim();
  if (name.length === 0) {
    errors.fullName = "Please enter your full name.";
  } else if (name.length < 2) {
    errors.fullName = "Please enter a valid full name (at least 2 characters).";
  } else if (!/^[\p{L}\p{M}.'’\- ]+$/u.test(name)) {
    errors.fullName =
      "Please enter a valid full name (letters, spaces, hyphens and apostrophes only).";
  }

  if (details.age === null || Number.isNaN(details.age)) {
    errors.age = "Please enter your age.";
  } else if (!Number.isInteger(details.age)) {
    errors.age = "Please enter a valid age (whole number of years).";
  } else if (details.age < LIMITS.age.min || details.age > LIMITS.age.max) {
    errors.age = `Please enter an age between ${LIMITS.age.min} and ${LIMITS.age.max}.`;
  }

  if (!details.gender) {
    errors.gender = "Please select your gender.";
  }

  if (details.heightCm === null || Number.isNaN(details.heightCm)) {
    errors.heightCm = "Please enter your height.";
  } else if (
    details.heightCm < LIMITS.heightCm.min ||
    details.heightCm > LIMITS.heightCm.max
  ) {
    errors.heightCm = `Please enter a height between ${LIMITS.heightCm.min} cm and ${LIMITS.heightCm.max} cm.`;
  }

  if (details.weightKg === null || Number.isNaN(details.weightKg)) {
    errors.weightKg = "Please enter your weight.";
  } else if (
    details.weightKg < LIMITS.weightKg.min ||
    details.weightKg > LIMITS.weightKg.max
  ) {
    errors.weightKg = `Please enter a weight between ${LIMITS.weightKg.min} kg and ${LIMITS.weightKg.max} kg.`;
  }

  if (!details.activityLevel) {
    errors.activityLevel = "Please select your activity level.";
  }

  return errors;
}

/* ------------------------------------------------------------------ */
/* Part 3 — nutrition, goals and preferences                           */
/* ------------------------------------------------------------------ */

export function validateNutritionAndPreferences(
  nutrition: NutritionalInformation,
  preferences: DietaryPreferences,
): NutritionErrors {
  const errors: NutritionErrors = {};

  if (!nutrition.primaryGoal) {
    errors.primaryGoal = "Please select your main goal.";
  }

  if (!preferences.dietaryType) {
    errors.dietaryType = "Please select a dietary pattern.";
  }

  if (
    nutrition.dailyCalorieTarget !== null &&
    (!Number.isFinite(nutrition.dailyCalorieTarget) ||
      nutrition.dailyCalorieTarget < LIMITS.calories.min ||
      nutrition.dailyCalorieTarget > LIMITS.calories.max)
  ) {
    errors.dailyCalorieTarget = `Please enter a realistic daily calorie target (${LIMITS.calories.min}–${LIMITS.calories.max} kcal) or leave it blank.`;
  }

  if (
    nutrition.proteinTargetGrams !== null &&
    (!Number.isFinite(nutrition.proteinTargetGrams) ||
      nutrition.proteinTargetGrams < LIMITS.protein.min ||
      nutrition.proteinTargetGrams > LIMITS.protein.max)
  ) {
    errors.proteinTargetGrams = `Please enter a realistic protein target (${LIMITS.protein.min}–${LIMITS.protein.max} g) or leave it blank.`;
  }

  return errors;
}

/* ------------------------------------------------------------------ */
/* Part 4 — food intake                                                */
/* ------------------------------------------------------------------ */

export interface FoodIntakeIssue {
  mealId: MealId;
  itemId?: string;
  field: "name" | "quantity" | "meal";
  message: string;
}

/**
 * Validates every food row in every meal.
 * Blank rows are not reported here — they are stripped before saving by
 * `pruneEmptyFoodRows` so the user never has to clean up after themselves.
 */
export function validateFoodIntake(intake: FoodIntake): FoodIntakeIssue[] {
  const issues: FoodIntakeIssue[] = [];

  for (const mealId of MEAL_IDS) {
    const meal = intake[mealId];
    if (!meal || !meal.hasMeal) continue;

    for (const item of meal.items) {
      const hasName = item.name.trim().length > 0;
      const hasQuantity = item.quantity !== null;

      // A row with a quantity but no name is incomplete, not empty.
      if (!hasName && (hasQuantity || item.notes.trim().length > 0)) {
        issues.push({
          mealId,
          itemId: item.id,
          field: "name",
          message: "Please enter a food name or remove this row.",
        });
      }

      if (hasQuantity) {
        const quantity = item.quantity as number;
        if (!Number.isFinite(quantity)) {
          issues.push({
            mealId,
            itemId: item.id,
            field: "quantity",
            message: "Please enter a valid quantity.",
          });
        } else if (quantity <= 0) {
          issues.push({
            mealId,
            itemId: item.id,
            field: "quantity",
            message: "Quantity must be greater than zero.",
          });
        } else if (quantity > LIMITS.quantity.max) {
          issues.push({
            mealId,
            itemId: item.id,
            field: "quantity",
            message: `Please enter a quantity below ${LIMITS.quantity.max}.`,
          });
        }
      }
    }
  }

  return issues;
}

/** True when the user has described at least one meal they actually eat. */
export function hasAnyFoodIntake(intake: FoodIntake): boolean {
  return MEAL_IDS.some(
    (mealId) =>
      intake[mealId]?.hasMeal && intake[mealId].items.some((item) => item.name.trim()),
  );
}

/* ------------------------------------------------------------------ */
/* Part 5 — whole-profile validation before storage                    */
/* ------------------------------------------------------------------ */

export interface ProfileIssue {
  section: "personalDetails" | "nutrition" | "dietary" | "foodIntake";
  /** Deep-linkable planner step for the "Fix this" action. */
  step: number;
  field: string;
  message: string;
}

export function validateCompleteProfile(profile: UserProfile): ProfileIssue[] {
  const issues: ProfileIssue[] = [];

  for (const [field, message] of Object.entries(
    validatePersonalDetails(profile.personalDetails),
  )) {
    if (message) {
      issues.push({ section: "personalDetails", step: 1, field, message });
    }
  }

  const nutritionErrors = validateNutritionAndPreferences(
    profile.nutritionalInformation,
    profile.dietaryPreferences,
  );
  for (const [field, message] of Object.entries(nutritionErrors)) {
    if (!message) continue;
    issues.push({
      section: field === "dietaryType" ? "dietary" : "nutrition",
      step: 2,
      field,
      message,
    });
  }

  for (const issue of validateFoodIntake(profile.foodIntake)) {
    issues.push({
      section: "foodIntake",
      step: 3,
      field: `${issue.mealId}.${issue.field}`,
      message: `${mealLabel(issue.mealId)}: ${issue.message}`,
    });
  }

  return issues;
}

/* ------------------------------------------------------------------ */
/* Completion checks (driven by validation, not by UI state)           */
/* ------------------------------------------------------------------ */

export function isPersonalDetailsComplete(details: PersonalDetails): boolean {
  return Object.keys(validatePersonalDetails(details)).length === 0;
}

export function isNutritionComplete(
  nutrition: NutritionalInformation,
  preferences: DietaryPreferences,
): boolean {
  return (
    Object.keys(validateNutritionAndPreferences(nutrition, preferences))
      .length === 0
  );
}

/**
 * Food intake counts as complete when it is free of errors AND the user
 * has described at least one meal. Everything else in Part 4 is optional.
 */
export function isFoodIntakeComplete(intake: FoodIntake): boolean {
  return validateFoodIntake(intake).length === 0 && hasAnyFoodIntake(intake);
}
