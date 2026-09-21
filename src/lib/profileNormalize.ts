/**
 * Profile normalisation, rehydration and comparison (Part 5).
 *
 * Three responsibilities, all pure and framework-free:
 *
 *  1. `normalizeProfileForStorage` — tidies a profile before it is saved
 *     (trims text, removes duplicate list entries, drops blank food rows).
 *     It never rewrites the *meaning* of free-text notes.
 *
 *  2. `rehydrateProfile` — rebuilds a fully-shaped `UserProfile` from
 *     arbitrary parsed JSON. Unknown/missing/older fields fall back to the
 *     defaults from `createEmptyProfile()`, so a profile saved by an older
 *     version of the app can never crash the UI.
 *
 *  3. `profilesAreEquivalent` — content comparison used for the
 *     "unsaved changes" indicator (ignores storage metadata).
 */
import {
  CURRENT_PROFILE_VERSION,
  createEmptyFoodIntake,
  createEmptyMealTimings,
  createEmptyProfile,
  MEAL_IDS,
  type FoodIntake,
  type FoodItem,
  type MealEntry,
  type MealTimings,
  type UserProfile,
} from "@/types/profile";
import { createId } from "@/lib/id";
import { normalizeFood } from "@/lib/normalize";

/* ------------------------------------------------------------------ */
/* Small coercion helpers                                              */
/* ------------------------------------------------------------------ */

type Raw = Record<string, unknown>;

function asRecord(value: unknown): Raw {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Raw)
    : {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/** Accepts numbers and numeric strings; anything else becomes null. */
function asNumberOrNull(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim() !== "")));
}

/** "HH:MM" 24-hour times only; anything else is treated as unspecified. */
function asTime(value: unknown): string {
  const text = asString(value).trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : "";
}

/* ------------------------------------------------------------------ */
/* Food intake helpers                                                 */
/* ------------------------------------------------------------------ */

export function createFoodItem(): FoodItem {
  return { id: createId("food"), name: "", quantity: null, unit: "", notes: "" };
}

/** True when a row carries no user content at all. */
export function isEmptyFoodItem(item: FoodItem): boolean {
  return (
    item.name.trim() === "" &&
    item.quantity === null &&
    item.notes.trim() === ""
  );
}

/** Drops completely blank rows so meaningless objects are never stored. */
export function pruneEmptyFoodRows(intake: FoodIntake): FoodIntake {
  const result = createEmptyFoodIntake();
  for (const mealId of MEAL_IDS) {
    const meal = intake[mealId];
    result[mealId] = {
      hasMeal: meal.hasMeal,
      notes: meal.notes,
      items: meal.items.filter((item) => !isEmptyFoodItem(item)),
    };
  }
  return result;
}

function rehydrateFoodItem(raw: unknown): FoodItem {
  const record = asRecord(raw);
  return {
    id: asString(record.id) || createId("food"),
    name: asString(record.name),
    quantity: asNumberOrNull(record.quantity),
    unit: asString(record.unit),
    notes: asString(record.notes),
  };
}

function rehydrateMeal(raw: unknown, fallback: MealEntry): MealEntry {
  const record = asRecord(raw);
  const items = Array.isArray(record.items)
    ? record.items.map(rehydrateFoodItem)
    : fallback.items;
  return {
    hasMeal: asBoolean(record.hasMeal, fallback.hasMeal),
    items,
    notes: asString(record.notes, fallback.notes),
  };
}

function rehydrateFoodIntake(raw: unknown): FoodIntake {
  const record = asRecord(raw);
  const defaults = createEmptyFoodIntake();
  const result = createEmptyFoodIntake();
  for (const mealId of MEAL_IDS) {
    result[mealId] = rehydrateMeal(record[mealId], defaults[mealId]);
  }
  return result;
}

function rehydrateMealTimings(raw: unknown): MealTimings {
  const record = asRecord(raw);
  const result = createEmptyMealTimings();
  for (const mealId of MEAL_IDS) {
    result[mealId] = asTime(record[mealId]);
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* Rehydration                                                         */
/* ------------------------------------------------------------------ */

/**
 * Rebuilds a complete, well-shaped profile from parsed JSON of unknown
 * origin. Never throws; missing sections use the default profile.
 */
export function rehydrateProfile(raw: unknown): UserProfile {
  const defaults = createEmptyProfile();
  const record = asRecord(raw);

  const personal = asRecord(record.personalDetails);
  const nutrition = asRecord(record.nutritionalInformation);
  const dietary = asRecord(record.dietaryPreferences);
  const habits = asRecord(record.mealHabits);
  const water = asRecord(record.waterIntake);
  const constraints = asRecord(record.practicalConstraints);

  return {
    profileVersion:
      asNumberOrNull(record.profileVersion) ?? CURRENT_PROFILE_VERSION,
    profileId: asString(record.profileId),
    createdAt: asString(record.createdAt) || null,
    updatedAt: asString(record.updatedAt) || null,

    personalDetails: {
      fullName: asString(personal.fullName),
      age: asNumberOrNull(personal.age),
      gender: asString(personal.gender) as UserProfile["personalDetails"]["gender"],
      heightCm: asNumberOrNull(personal.heightCm),
      weightKg: asNumberOrNull(personal.weightKg),
      activityLevel: asString(
        personal.activityLevel,
      ) as UserProfile["personalDetails"]["activityLevel"],
      occupationOrLifestyle: asString(personal.occupationOrLifestyle),
    },

    nutritionalInformation: {
      primaryGoal: asString(
        nutrition.primaryGoal,
      ) as UserProfile["nutritionalInformation"]["primaryGoal"],
      dailyCalorieTarget: asNumberOrNull(nutrition.dailyCalorieTarget),
      proteinTargetGrams: asNumberOrNull(nutrition.proteinTargetGrams),
    },

    dietaryPreferences: {
      dietaryType: asString(
        dietary.dietaryType,
      ) as UserProfile["dietaryPreferences"]["dietaryType"],
      preferredCuisines: asStringArray(dietary.preferredCuisines),
      foodPreferenceNotes: asString(dietary.foodPreferenceNotes),
    },

    allergies: asStringArray(record.allergies),
    intolerances: asStringArray(record.intolerances),
    preferredFoods: asStringArray(record.preferredFoods),
    foodsToAvoid: asStringArray(record.foodsToAvoid),

    foodIntake:
      record.foodIntake === undefined
        ? defaults.foodIntake
        : rehydrateFoodIntake(record.foodIntake),
    mealTimings: rehydrateMealTimings(record.mealTimings),

    mealHabits: {
      mealsPerDay: asNumberOrNull(habits.mealsPerDay),
      snackingFrequency: asString(
        habits.snackingFrequency,
      ) as UserProfile["mealHabits"]["snackingFrequency"],
      lateNightEating: asString(
        habits.lateNightEating,
      ) as UserProfile["mealHabits"]["lateNightEating"],
    },

    waterIntake: {
      litresPerDay: asNumberOrNull(water.litresPerDay),
      sourceUnit: asString(
        water.sourceUnit,
      ) as UserProfile["waterIntake"]["sourceUnit"],
    },

    practicalConstraints: {
      typicalDailySchedule: asString(constraints.typicalDailySchedule),
      foodAvailability: asStringArray(constraints.foodAvailability),
      mealPreparationTime: asString(
        constraints.mealPreparationTime,
      ) as UserProfile["practicalConstraints"]["mealPreparationTime"],
      mealPreparationPreference: asString(
        constraints.mealPreparationPreference,
      ) as UserProfile["practicalConstraints"]["mealPreparationPreference"],
      weekendDifference: asString(
        constraints.weekendDifference,
      ) as UserProfile["practicalConstraints"]["weekendDifference"],
      weekendNotes: asString(constraints.weekendNotes),
    },

    additionalInformation: asString(record.additionalInformation),
  };
}

/* ------------------------------------------------------------------ */
/* Normalisation before storage                                        */
/* ------------------------------------------------------------------ */

/**
 * Tidies the profile without changing the meaning of anything the user
 * wrote. Free-text notes are only trimmed at the ends.
 */
export function normalizeProfileForStorage(profile: UserProfile): UserProfile {
  const pruned = pruneEmptyFoodRows(profile.foodIntake);
  const foodIntake = createEmptyFoodIntake();

  for (const mealId of MEAL_IDS) {
    const meal = pruned[mealId];
    foodIntake[mealId] = {
      hasMeal: meal.hasMeal,
      notes: meal.notes.trim(),
      items: meal.items.map((item) => ({
        id: item.id,
        name: item.name.trim(),
        quantity: item.quantity,
        unit: item.unit,
        notes: item.notes.trim(),
      })),
    };
  }

  return {
    ...profile,
    personalDetails: {
      ...profile.personalDetails,
      fullName: profile.personalDetails.fullName.trim().replace(/\s+/g, " "),
      occupationOrLifestyle: profile.personalDetails.occupationOrLifestyle.trim(),
    },
    dietaryPreferences: {
      ...profile.dietaryPreferences,
      preferredCuisines: uniqueStrings(profile.dietaryPreferences.preferredCuisines),
      foodPreferenceNotes: profile.dietaryPreferences.foodPreferenceNotes.trim(),
    },
    allergies: uniqueStrings(profile.allergies),
    intolerances: uniqueStrings(profile.intolerances),
    preferredFoods: uniqueStrings(profile.preferredFoods.map(normalizeFood)),
    foodsToAvoid: uniqueStrings(profile.foodsToAvoid.map(normalizeFood)),
    foodIntake,
    practicalConstraints: {
      ...profile.practicalConstraints,
      typicalDailySchedule: profile.practicalConstraints.typicalDailySchedule.trim(),
      foodAvailability: uniqueStrings(profile.practicalConstraints.foodAvailability),
      weekendNotes: profile.practicalConstraints.weekendNotes.trim(),
    },
    additionalInformation: profile.additionalInformation.trim(),
  };
}

/* ------------------------------------------------------------------ */
/* Comparison (unsaved-changes detection)                              */
/* ------------------------------------------------------------------ */

/** Strips storage metadata and volatile row ids so only content matters. */
function comparableContent(profile: UserProfile) {
  const normalized = normalizeProfileForStorage(profile);
  const foodIntake = MEAL_IDS.map((mealId) => {
    const meal = normalized.foodIntake[mealId];
    return {
      mealId,
      hasMeal: meal.hasMeal,
      notes: meal.notes,
      items: meal.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        notes: item.notes,
      })),
    };
  });

  return JSON.stringify({
    personalDetails: normalized.personalDetails,
    nutritionalInformation: normalized.nutritionalInformation,
    dietaryPreferences: normalized.dietaryPreferences,
    allergies: [...normalized.allergies].sort(),
    intolerances: [...normalized.intolerances].sort(),
    preferredFoods: [...normalized.preferredFoods].sort(),
    foodsToAvoid: [...normalized.foodsToAvoid].sort(),
    foodIntake,
    mealTimings: normalized.mealTimings,
    mealHabits: normalized.mealHabits,
    waterIntake: normalized.waterIntake,
    practicalConstraints: normalized.practicalConstraints,
    additionalInformation: normalized.additionalInformation,
  });
}

export function profilesAreEquivalent(
  first: UserProfile,
  second: UserProfile,
): boolean {
  return comparableContent(first) === comparableContent(second);
}

/** Glasses → litres conversion used by the hydration field (250 ml/glass). */
export const LITRES_PER_GLASS = 0.25;
