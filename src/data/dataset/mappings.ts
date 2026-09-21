/**
 * Part 11 — transparent mappings from dataset wording to application ids.
 *
 * Every mapping assumption is written down here (requirement 14) instead of
 * being buried in parsing code. Unmapped values become `null` and are
 * flagged — the importer never guesses a category.
 */
import type { ActivityLevel, Gender } from "../../types/profile.ts";

/* ------------------------------------------------------------------ */
/* Activity level                                                      */
/* ------------------------------------------------------------------ */

/**
 * Dataset labels → application ids.
 *
 * DOCUMENTED ASSUMPTIONS
 *  - "Light"      → lightly_active      (the dataset has no separate
 *                                        "Lightly Active" label, so "Light"
 *                                        is taken as the nearest match)
 *  - "Moderate"   → moderately_active
 *  - "Active"     → very_active         ("Active" in the source is treated
 *                                        as a genuinely active lifestyle,
 *                                        one step above "Moderate")
 *  - "Very Active"→ extremely_active    (the dataset's most active label maps
 *                                        to the application's most active id)
 *
 * These are judgement calls, not equivalences proven by the source. Where a
 * label is not listed, the result is `null` and the record is flagged.
 */
const ACTIVITY_MAP: Record<string, ActivityLevel> = {
  sedentary: "sedentary",
  low: "sedentary",
  inactive: "sedentary",
  light: "lightly_active",
  lightlyactive: "lightly_active",
  "lightly active": "lightly_active",
  moderate: "moderately_active",
  moderatelyactive: "moderately_active",
  "moderately active": "moderately_active",
  active: "very_active",
  veryactive: "extremely_active",
  "very active": "extremely_active",
  extremelyactive: "extremely_active",
  "extremely active": "extremely_active",
  athlete: "extremely_active",
};

/** Normalises a label for lookup: trim, lowercase, collapse spaces. */
function key(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function datasetActivityToApplicationActivity(
  source: string,
): ActivityLevel | null {
  const normalised = key(source);
  if (!normalised) return null;
  return ACTIVITY_MAP[normalised] ?? ACTIVITY_MAP[normalised.replace(/\s+/g, "")] ?? null;
}

/* ------------------------------------------------------------------ */
/* Gender                                                              */
/* ------------------------------------------------------------------ */

/**
 * Only formatting is normalised — the source terminology is preserved in
 * `genderSource`. Unrecognised wording maps to `null` rather than being
 * reinterpreted into another classification.
 */
const GENDER_MAP: Record<string, Gender> = {
  male: "male",
  m: "male",
  man: "male",
  female: "female",
  f: "female",
  woman: "female",
};

export function datasetGenderToApplicationGender(source: string): Gender | null {
  const normalised = key(source);
  if (!normalised) return null;
  return GENDER_MAP[normalised] ?? null;
}

/** " Male " → "Male" (case/whitespace only, never spelling). */
export function cleanDisplayTerm(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/* ------------------------------------------------------------------ */
/* Column aliases                                                      */
/* ------------------------------------------------------------------ */

/**
 * The supplied extraction may spell headers several ways ("Height (cm)",
 * "Height_cm", "height"). Aliases are resolved case-insensitively so the
 * importer does not depend on one exact header string.
 */
export const COLUMN_ALIASES: Record<string, string[]> = {
  participantId: [
    "participant id", "participantid", "participant_id", "id", "pid",
  ],
  name: ["name", "participant name", "full name"],
  age: ["age", "age years", "age (years)"],
  gender: ["gender", "sex"],
  heightCm: ["height cm", "height (cm)", "height_cm", "height", "height in cm"],
  weightKg: ["weight kg", "weight (kg)", "weight_kg", "weight", "weight in kg"],
  activityLevel: [
    "activity level", "activitylevel", "activity_level", "activity",
    "physical activity", "physical activity level",
  ],
  breakfast: ["breakfast"],
  lunch: ["lunch"],
  dinner: ["dinner"],
  snacks: ["snacks", "snack", "snacking"],
  caloriesKcal: [
    "calories kcal", "calories (kcal)", "calories_kcal", "calories",
    "total calories", "energy kcal", "energy (kcal)",
  ],
  proteinG: ["protein g", "protein (g)", "protein_g", "protein"],
  carbohydratesG: [
    "carbohydrates g", "carbohydrates (g)", "carbohydrates_g", "carbohydrates",
    "carbs g", "carbs (g)", "carbs",
  ],
  fatG: ["fat g", "fat (g)", "fat_g", "fat", "total fat"],
  dietaryFibreG: [
    "dietary fibre g", "dietary fibre (g)", "dietary_fibre_g", "dietary fibre",
    "fiber g", "fiber (g)", "fibre g", "fibre (g)", "fibre", "fiber",
  ],
  sugarG: ["sugar g", "sugar (g)", "sugar_g", "sugar", "sugars g", "sugars"],
  sodiumMg: ["sodium mg", "sodium (mg)", "sodium_mg", "sodium"],
};

/** Maps one raw header string to a canonical field name, or null. */
export function resolveColumn(rawHeader: string): string | null {
  const normalised = rawHeader.trim().toLowerCase().replace(/[_\s]+/g, " ");
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.some((alias) => alias === normalised)) return field;
  }
  return null;
}
