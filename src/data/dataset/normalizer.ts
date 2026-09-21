/**
 * Part 11 — raw row → cleaned record.
 *
 * The supplied PDF extraction is NOT reliably delimited: adjacent values can
 * run together (e.g. "Protein ShakeSamosa"). The rules below therefore
 * separate what can be trusted from what cannot:
 *
 *   • Reliable separators (comma, semicolon, pipe, " and ", " & ") are split.
 *   • A token showing a lower→upper case boundary mid-word is treated as a
 *     likely concatenation. It is NOT split and NOT invented — the record is
 *     flagged `ambiguous` so a human can check it against the source PDF.
 *
 * Nothing here ever fabricates a value: missing data stays `null` / `[]`.
 */
import {
  cleanQuality,
  emptyMeals,
  emptyNutrition,
  PARSER_VERSION,
  SOURCE_FILE_LABEL,
  worstStatus,
  type DataQuality,
  type DataQualityStatus,
  type DatasetParticipant,
  type ParticipantMeals,
  type ParticipantNutrition,
} from "./schema.ts";
import {
  cleanDisplayTerm,
  datasetActivityToApplicationActivity,
  datasetGenderToApplicationGender,
  resolveColumn,
} from "./mappings.ts";

/** Raw row as extracted: header → cell text. */
export type RawRow = Record<string, string>;

export interface RawRecord {
  row: RawRow;
  sourcePage: number | null;
  sourceRow: number | null;
}

export interface NormaliseResult {
  participant: DatasetParticipant;
  /** Field names that were absent from the source header entirely. */
  absentColumns: string[];
}

/* ------------------------------------------------------------------ */
/* Primitive coercion                                                  */
/* ------------------------------------------------------------------ */

/** Collapse whitespace and trim. Never rewrites spelling. */
export function cleanText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

/**
 * Numeric extraction that tolerates units ("180 cm", "74 kg", "1,853 kcal").
 * Returns null for anything absent, blank or non-numeric — never 0, never NaN.
 * Negative numbers are returned so the validator can reject and flag them.
 */
export function toNumberOrNull(value: unknown): number | null {
  const text = cleanText(value).replace(/,/g, "");
  if (!text) return null;

  const match = text.match(/^-?\d+(?:\.\d+)?/);
  if (!match) return null;

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

/** True when the source cell existed but held no usable content. */
export function isBlankCell(value: unknown): boolean {
  const text = cleanText(value);
  return text === "" || text === "-" || text.toLowerCase() === "n/a";
}

/* ------------------------------------------------------------------ */
/* Meal text handling                                                  */
/* ------------------------------------------------------------------ */

const RELIABLE_SEPARATORS = /\s*(?:,|;|\||\band\b|&|\/)\s*/i;

/**
 * Detects a probable extraction concatenation such as "ShakeSamosa":
 * a lowercase letter immediately followed by an uppercase letter inside a
 * word. Single capitals after a space ("Protein Shake") are normal and are
 * NOT flagged.
 */
export function looksConcatenated(token: string): boolean {
  return /[a-z][A-Z]/.test(token);
}

export interface MealParseResult {
  items: string[];
  /** True when at least one item could not be split with confidence. */
  ambiguous: boolean;
  /** Original text kept for traceability. */
  raw: string;
}

/**
 * Splits a meal cell into items only where the boundaries are trustworthy.
 * Ambiguous tokens are preserved verbatim (never silently split, never
 * silently dropped) and reported so the record can be flagged.
 */
export function parseMealText(value: unknown): MealParseResult {
  const raw = cleanText(value);
  if (!raw || isBlankCell(raw)) {
    return { items: [], ambiguous: false, raw };
  }

  const parts = raw
    .split(RELIABLE_SEPARATORS)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const ambiguous = parts.some((part) => looksConcatenated(part));

  return { items: parts, ambiguous, raw };
}

/* ------------------------------------------------------------------ */
/* Header resolution                                                   */
/* ------------------------------------------------------------------ */

/** Maps raw headers to canonical field names once per import. */
export function buildColumnIndex(headers: string[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const header of headers) {
    const field = resolveColumn(header);
    if (field && !index.has(field)) index.set(field, header);
  }
  return index;
}

function readField(row: RawRow, index: Map<string, string>, field: string): string {
  const header = index.get(field);
  if (header === undefined) return "";
  return row[header] ?? "";
}

/* ------------------------------------------------------------------ */
/* Main normalisation                                                  */
/* ------------------------------------------------------------------ */

const MEAL_SLOTS: Array<keyof ParticipantMeals> = [
  "breakfast",
  "lunch",
  "dinner",
  "snacks",
];

const NUTRITION_FIELDS: Array<keyof ParticipantNutrition> = [
  "caloriesKcal",
  "proteinG",
  "carbohydratesG",
  "fatG",
  "dietaryFibreG",
  "sugarG",
  "sodiumMg",
];

/** Fields whose absence is worth reporting (all are expected in the source). */
const EXPECTED_COLUMNS = [
  "participantId",
  "name",
  "age",
  "gender",
  "heightCm",
  "weightKg",
  "activityLevel",
  ...MEAL_SLOTS,
  ...NUTRITION_FIELDS,
];

export function normaliseRecord(
  raw: RawRecord,
  index: Map<string, string>,
  importedAt: string,
): NormaliseResult {
  const { row } = raw;
  const issues: string[] = [];
  let status: DataQualityStatus = "clean";
  const raise = (next: DataQualityStatus, message: string) => {
    status = worstStatus(status, next);
    issues.push(message);
  };

  const absentColumns = EXPECTED_COLUMNS.filter((field) => !index.has(field));

  /* ------------------------- identifier --------------------------- */
  const participantId = cleanText(readField(row, index, "participantId"));
  if (!participantId) {
    raise("missing_value", "Participant ID is missing.");
  }

  /* ---------------------------- name ------------------------------ */
  const name = cleanText(readField(row, index, "name"));
  if (!name) raise("missing_value", "Name is missing.");

  /* ----------------------------- age ------------------------------ */
  const ageCell = readField(row, index, "age");
  let age = toNumberOrNull(ageCell);
  if (age === null) {
    if (isBlankCell(ageCell)) raise("missing_value", "Age is missing.");
    else raise("parse_error", `Age could not be read as a number ("${cleanText(ageCell)}").`);
  } else if (age <= 0) {
    raise("parse_error", `Age must be a positive number (found ${age}).`);
    age = null;
  }

  /* --------------------------- gender ----------------------------- */
  const genderSourceRaw = cleanText(readField(row, index, "gender"));
  const genderSource = cleanDisplayTerm(genderSourceRaw);
  const gender = datasetGenderToApplicationGender(genderSourceRaw);
  if (genderSourceRaw && gender === null) {
    raise("needs_review", `Gender "${genderSource}" is not mapped to an application value.`);
  }

  /* --------------------- height / weight -------------------------- */
  // Physical measurements must be positive. A negative or zero value is
  // rejected to null so it can never reach downstream statistics or BMI.
  const heightCell = readField(row, index, "heightCm");
  let heightCm = toNumberOrNull(heightCell);
  if (heightCm === null) {
    if (isBlankCell(heightCell)) raise("missing_value", "Height is missing.");
    else raise("parse_error", `Height could not be read as a number ("${cleanText(heightCell)}").`);
  } else if (heightCm <= 0) {
    raise("parse_error", `Height must be a positive number (found ${heightCm}).`);
    heightCm = null;
  }

  const weightCell = readField(row, index, "weightKg");
  let weightKg = toNumberOrNull(weightCell);
  if (weightKg === null) {
    if (isBlankCell(weightCell)) raise("missing_value", "Weight is missing.");
    else raise("parse_error", `Weight could not be read as a number ("${cleanText(weightCell)}").`);
  } else if (weightKg <= 0) {
    raise("parse_error", `Weight must be a positive number (found ${weightKg}).`);
    weightKg = null;
  }

  /* --------------------- activity level --------------------------- */
  const activityLevelSourceRaw = cleanText(readField(row, index, "activityLevel"));
  const activityLevelSource = cleanDisplayTerm(activityLevelSourceRaw);
  const activityLevel = datasetActivityToApplicationActivity(activityLevelSourceRaw);
  if (!activityLevelSourceRaw) {
    raise("missing_value", "Activity level is missing.");
  } else if (activityLevel === null) {
    raise(
      "needs_review",
      `Activity level "${activityLevelSource}" is not covered by the documented mapping.`,
    );
  }

  /* ---------------------------- meals ----------------------------- */
  const meals = emptyMeals();
  let anyAmbiguous = false;
  for (const slot of MEAL_SLOTS) {
    const parsed = parseMealText(readField(row, index, slot));
    meals[slot] = parsed.items;
    if (parsed.ambiguous) anyAmbiguous = true;
  }
  if (anyAmbiguous) {
    raise(
      "ambiguous",
      "Meal field boundary ambiguous — the extracted text joins values without a reliable separator. It must be checked against the source PDF; the text was kept as-is and not split.",
    );
  }

  // Meals are optional individually, but a record with none at all cannot
  // contribute to meal-pattern analysis, so it is worth a human look.
  const totalMealItems = MEAL_SLOTS.reduce((sum, slot) => sum + meals[slot].length, 0);
  if (totalMealItems === 0) {
    raise("needs_review", "No meals were recorded for this participant.");
  }

  /* -------------------------- nutrition --------------------------- */
  const nutrition = emptyNutrition();
  const rejectedValues: string[] = [];
  for (const field of NUTRITION_FIELDS) {
    const cell = readField(row, index, field);
    const parsed = toNumberOrNull(cell);
    if (parsed === null) {
      if (!isBlankCell(cell)) {
        raise("parse_error", `${field} could not be read as a number ("${cleanText(cell)}").`);
      }
      continue;
    }
    if (parsed < 0) {
      rejectedValues.push(field);
      raise("parse_error", `${field} is negative (${parsed}) and was rejected.`);
      continue;
    }
    nutrition[field] = parsed;
  }

  /* ------------------- nutrition consistency ---------------------- */
  const nutritionDiagnostics = buildNutritionDiagnostics(
    nutrition,
    rejectedValues,
  );
  if (nutritionDiagnostics.consistency === "inconsistent") {
    raise(
      "needs_review",
      `Reported calories differ from the macro-derived value by ${Math.abs(
        Math.round(nutritionDiagnostics.calorieDifferencePercent ?? 0),
      )}%. Both values were kept; neither was overwritten.`,
    );
  }

  /* --------------------------- outliers --------------------------- */
  const outliers = detectOutliers({ age, heightCm, weightKg, nutrition });
  if (outliers.length > 0) {
    raise("needs_review", `Possible outlier value(s): ${outliers.join(", ")}.`);
  }

  /* -------------------------- provenance -------------------------- */
  const quality: DataQuality = {
    ...cleanQuality(),
    status,
    issues,
    needsReview: status !== "clean",
  };

  const participant: DatasetParticipant = {
    participantId,
    name,
    age,
    genderSource,
    gender,
    heightCm,
    weightKg,
    activityLevelSource,
    activityLevel,
    meals,
    nutrition,
    nutritionDiagnostics,
    outliers,
    quality,
    sourceMetadata: {
      sourceFile: SOURCE_FILE_LABEL,
      sourcePage: raw.sourcePage,
      sourceRow: raw.sourceRow,
      importedAt,
      parserVersion: PARSER_VERSION,
    },
  };

  return { participant, absentColumns };
}

/* ------------------------------------------------------------------ */
/* Nutrition consistency (source values preserved, never corrected)    */
/* ------------------------------------------------------------------ */

/** Atwater factors — the same constants the application uses elsewhere. */
export const KCAL_PER_GRAM = { protein: 4, carbohydrate: 4, fat: 9 } as const;

/** Percentage difference above which a record is called inconsistent. */
export const CONSISTENCY_TOLERANCE_PERCENT = 15;

export function buildNutritionDiagnostics(
  nutrition: ParticipantNutrition,
  rejectedValues: string[],
): DatasetParticipant["nutritionDiagnostics"] {
  const sourceCaloriesKcal = nutrition.caloriesKcal;
  const { proteinG, carbohydratesG, fatG } = nutrition;

  if (proteinG === null || carbohydratesG === null || fatG === null) {
    return {
      sourceCaloriesKcal,
      macroDerivedCalories: null,
      calorieDifference: null,
      calorieDifferencePercent: null,
      consistency: "not_computable",
      rejectedValues,
    };
  }

  const macroDerivedCalories = Math.round(
    proteinG * KCAL_PER_GRAM.protein +
      carbohydratesG * KCAL_PER_GRAM.carbohydrate +
      fatG * KCAL_PER_GRAM.fat,
  );

  if (sourceCaloriesKcal === null || sourceCaloriesKcal === 0) {
    return {
      sourceCaloriesKcal,
      macroDerivedCalories,
      calorieDifference: null,
      calorieDifferencePercent: null,
      consistency: "not_computable",
      rejectedValues,
    };
  }

  const difference = Math.round(macroDerivedCalories - sourceCaloriesKcal);
  const percent = Math.round((Math.abs(difference) / sourceCaloriesKcal) * 100);

  const consistency =
    percent <= 5
      ? "consistent"
      : percent <= CONSISTENCY_TOLERANCE_PERCENT
        ? "minor_difference"
        : "inconsistent";

  return {
    sourceCaloriesKcal,
    macroDerivedCalories,
    calorieDifference: difference,
    calorieDifferencePercent: percent,
    consistency,
    rejectedValues,
  };
}

/* ------------------------------------------------------------------ */
/* Outlier flags (never deletions)                                     */
/* ------------------------------------------------------------------ */

export const OUTLIER_BOUNDS = {
  age: { min: 10, max: 100 },
  heightCm: { min: 120, max: 220 },
  weightKg: { min: 30, max: 200 },
  caloriesKcal: { min: 500, max: 6000 },
  sodiumMg: { min: 0, max: 10000 },
} as const;

function flagOutOfRange(
  label: string,
  value: number | null,
  bounds: { min: number; max: number },
  out: string[],
): void {
  if (value === null) return;
  if (value < bounds.min || value > bounds.max) {
    out.push(`${label}=${value} outside ${bounds.min}–${bounds.max}`);
  }
}

export function detectOutliers(input: {
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  nutrition: ParticipantNutrition;
}): string[] {
  const out: string[] = [];
  flagOutOfRange("age", input.age, OUTLIER_BOUNDS.age, out);
  flagOutOfRange("heightCm", input.heightCm, OUTLIER_BOUNDS.heightCm, out);
  flagOutOfRange("weightKg", input.weightKg, OUTLIER_BOUNDS.weightKg, out);
  flagOutOfRange(
    "caloriesKcal",
    input.nutrition.caloriesKcal,
    OUTLIER_BOUNDS.caloriesKcal,
    out,
  );
  flagOutOfRange(
    "sodiumMg",
    input.nutrition.sodiumMg,
    OUTLIER_BOUNDS.sodiumMg,
    out,
  );

  // BMI outside a plausible adult range is worth a look too.
  if (input.heightCm && input.weightKg && input.heightCm > 0) {
    const metres = input.heightCm / 100;
    const bmi = input.weightKg / (metres * metres);
    if (bmi < 12 || bmi > 50) {
      out.push(`derived BMI=${bmi.toFixed(1)} outside 12–50`);
    }
  }

  return out;
}
