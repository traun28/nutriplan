/**
 * Part 12 — structured-value extraction from document text.
 *
 * Runs the SAME rules on every format's extracted text (TXT, PDF, DOCX,
 * OCR, HTML body …), so a "Weight: 68 kg" line is understood regardless
 * of which file it came from.
 *
 * Everything here produces CANDIDATES with a confidence and provenance.
 * Nothing is written to the user profile: the review screen (Part 12) and
 * the import confirmation decide that.
 */
import type {
  Confidence,
  ExtractedField,
  ExtractedFood,
  ExtractedNutrient,
} from "../../types/attachment.ts";

/* ------------------------------------------------------------------ */
/* Confidence                                                          */
/* ------------------------------------------------------------------ */

function confidence(
  pattern: RegExp,
  text: string,
  whenPresent: Confidence,
  whenAbsent: Confidence,
): Confidence {
  return new RegExp(pattern.source, pattern.flags).test(text)
    ? whenPresent
    : whenAbsent;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Pulls the first number from a match, tolerating units and separators. */
function num(raw: string): number | null {
  const cleaned = raw.replace(/[,\s]/g, "");
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
}

/** Title-cases a label for display. */
function human(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

/* ------------------------------------------------------------------ */
/* Personal details                                                    */
/* ------------------------------------------------------------------ */

interface FieldRule {
  key: string;
  /** Matches the line, with capture group 1 = the value. */
  pattern: RegExp;
  unit?: string;
  safetyRelevant?: boolean;
  /**
   * Optional value normalisation (else the raw number/string is kept).
   * Receives the captured value AND the full match so compound rules
   * (e.g. 5'9") can read several groups.
   */
  normalize?: (raw: string, match: RegExpMatchArray) => string | number | null;
  confidence?: Confidence;
}

const PERSONAL_RULES: FieldRule[] = [
  {
    key: "age",
    pattern: /(?:^|\n)\s*(?:age|a(?:ge)?\s*[:\-–=])\s*[^\d]{0,12}(\d{1,3})\s*(?:years?|yrs?|y)?\b/i,
    normalize: (r) => num(r),
  },
  {
    key: "heightCm",
    pattern: /(?:height|ht)(?:cm)?\s*[:\-–]?\s*(\d{2,3}(?:\.\d)?)\s*(?:cm|centimetres?|cms?)?\b/i,
    unit: "cm",
    normalize: (r) => num(r),
  },
  {
    key: "heightCm",
    pattern: /(?:height|ht)\s*[:\-–]?\s*(\d)\s*(?:'|ft|feet)\s*(\d{1,2})?\s*(?:"|in|inches)?/i,
    normalize: (_raw, match) => {
      if (!match) return null;
      const feet = Number(match[1]);
      const inches = Number(match[2] ?? 0);
      const total = feet * 12 + inches;
      return total > 0 ? Math.round(total * 2.54 * 10) / 10 : null;
    },
  },
  {
    key: "weightKg",
    pattern: /(?:weight|wt|body\s*weight)(?:kg)?\s*[:\-–]?\s*(\d{2,3}(?:\.\d)?)\s*(?:kg|kilograms?|kgs?)?\b/i,
    unit: "kg",
    normalize: (r) => num(r),
  },
  {
    key: "weightKg",
    pattern: /(?:weight|wt)\s*[:\-–]?\s*(\d{2,3})\s*(?:lbs?|pounds)\b/i,
    unit: "kg (converted from lb)",
    normalize: (r) => {
      const lb = num(r);
      return lb !== null ? Math.round(lb * 0.453592 * 10) / 10 : null;
    },
  },
  {
    key: "gender",
    pattern: /(?:^|\n)\s*(?:gender|sex)\s*[:\-–]?\s*(male|female|other|prefer\s*not\s*to\s*say)\b/i,
  },
  {
    key: "activityLevel",
    pattern: /(?:activity(?:\s*level)?|lifestyle)\s*[:\-–]?\s*(sedentary|light(?:ly\s*active)?|moderate(?:ly\s*active)?|active|very\s*active|extremely\s*active|athlete)\b/i,
  },
];

const GOAL_RULES: FieldRule[] = [
  {
    key: "goal",
    pattern: /(?:goal|objective|target|aim)\s*[:\-–]?\s*(weight\s*loss|lose\s*weight|weight\s*gain|gain\s*weight|muscle\s*gain|maintain(?:ance)?|general\s*health|healthy\s*eating)/i,
    normalize: (r) => {
      const lower = r.toLowerCase();
      if (lower.includes("loss") || lower.includes("lose")) return "weight_loss";
      if (lower.includes("gain") && lower.includes("muscle")) return "muscle_gain";
      if (lower.includes("gain")) return "weight_gain";
      if (lower.includes("maintain")) return "weight_maintenance";
      if (lower.includes("healthy") || lower.includes("health")) return "general_health";
      return null;
    },
  },
  {
    key: "dailyCalorieTarget",
    pattern: /(?:daily\s*)?(?:calorie|caloric|energy)\s*(?:target|goal|intake|requirement|needs?|allowance)\s*[:\-–]?\s*(\d{3,5})\s*(?:kcal|calories|cal)?\b/i,
    normalize: (r) => num(r),
    confidence: "high",
  },
  {
    key: "proteinTargetGrams",
    pattern: /protein\s*(?:target|goal|intake|requirement|needs?)\s*[:\-–]?\s*(\d{2,3}(?:\.\d)?)\s*(?:g|grams?)\b/i,
    normalize: (r) => num(r),
    confidence: "high",
  },
];

const DIET_RULES: FieldRule[] = [
  {
    key: "dietaryType",
    pattern: /(?:diet(?:ary)?\s*(?:type|pattern|preference|restriction)|eating\s*pattern)\s*[:\-–]?\s*(vegan|vegetarian|eggetarian|pescatarian|non[\s-]?vegetarian|omnivore)\b/i,
    normalize: (r) => r.toLowerCase().replace(/[\s-]+/g, "_").replace("non_vegetarian", "non_vegetarian"),
  },
];

const SAFETY_RULES: FieldRule[] = [
  {
    key: "allergen",
    pattern: /(?:allerg(?:y|ies|en)\s*(?:to)?|allergic\s*to|contains?\s*(?:traces?\s*of)?\s*(?:nuts?|allergens?)?)\s*[:\-–]?\s*([^\n.;]{3,120})/i,
    safetyRelevant: true,
  },
  {
    key: "intolerance",
    pattern: /(?:intolerance(?:s)?|sensitive\s*to|sensitivity)\s*[:\-–]?\s*([^\n.;]{3,120})/i,
    safetyRelevant: true,
  },
  {
    key: "foodsToAvoid",
    pattern: /(?:foods?\s*(?:to\s*)?avoid|avoid(?:ing)?\s*(?:foods?)?|do\s*not\s*eat|cannot\s*eat|restricted\s*foods?)\s*[:\-–]?\s*([^\n.;]{3,160})/i,
    safetyRelevant: true,
  },
];

/* ------------------------------------------------------------------ */
/* Nutrition label                                                     */
/* ------------------------------------------------------------------ */

export const NUTRIENT_RULES: Array<{
  nutrient: string;
  pattern: RegExp;
  unit: string;
}> = [
  { nutrient: "Calories", pattern: /(?:^|\n)\s*(?:energy|calories?|kcal)\s*[:\-–]?\s*(\d{2,5}(?:\.\d)?)\s*(?:kcal|calories?|cal)?\b/im, unit: "kcal" },
  { nutrient: "Protein", pattern: /protein\s*[:\-–]?\s*(\d{1,3}(?:\.\d)?)\s*(?:g|grams?)\b/i, unit: "g" },
  { nutrient: "Carbohydrates", pattern: /(?:carbohydrates?|carbs?|total\s*carbohydrate)\s*[:\-–]?\s*(\d{1,4}(?:\.\d)?)\s*(?:g|grams?)\b/i, unit: "g" },
  { nutrient: "Fat", pattern: /(?:^|\n)\s*fat\s*(?:total)?\s*[:\-–]?\s*(\d{1,3}(?:\.\d)?)\s*(?:g|grams?)\b/im, unit: "g" },
  { nutrient: "Dietary fibre", pattern: /(?:dietary\s*)?(?:fibre|fiber)\s*[:\-–]?\s*(\d{1,3}(?:\.\d)?)\s*(?:g|grams?)\b/i, unit: "g" },
  { nutrient: "Sugar", pattern: /sugars?\s*[:\-–]?\s*(\d{1,3}(?:\.\d)?)\s*(?:g|grams?)\b/i, unit: "g" },
  { nutrient: "Sodium", pattern: /sodium\s*[:\-–]?\s*(\d{1,5}(?:\.\d)?)\s*(?:mg|milligrams?)\b/i, unit: "mg" },
];

/* ------------------------------------------------------------------ */
/* Meals                                                               */
/* ------------------------------------------------------------------ */

const MEAL_PATTERNS: Array<{ meal: string; pattern: RegExp }> = [
  { meal: "breakfast", pattern: /\b(?:breakfast|bf)\s*[:\-–]\s*([^\n]{2,200})/i },
  { meal: "morningSnack", pattern: /\b(?:morning\s*snack|mid[\s-]?morning(?:\s*snack)?)\s*[:\-–]\s*([^\n]{2,200})/i },
  { meal: "lunch", pattern: /\blunch\s*[:\-–]\s*([^\n]{2,200})/i },
  { meal: "eveningSnack", pattern: /\b(?:evening\s*snack|afternoon\s*snack|tea(?:time)?\s*snack)\s*[:\-–]\s*([^\n]{2,200})/i },
  { meal: "dinner", pattern: /\bdinner\s*[:\-–]\s*([^\n]{2,200})/i },
  { meal: "otherSnacks", pattern: /\bsnacks?\s*[:\-–]\s*([^\n]{2,200})/i },
];

const FOOD_SPLIT = /\s*(?:,|;|\band\b|&|\+|\|)\s*/i;

function titleCase(text: string): string {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
    .trim();
}

/* ------------------------------------------------------------------ */
/* Main extraction                                                     */
/* ------------------------------------------------------------------ */

export interface TextExtraction {
  fields: ExtractedField[];
  nutrients: ExtractedNutrient[];
  foods: ExtractedFood[];
  warnings: string[];
  detectedKeys: string[];
}

/**
 * Extracts every structured value it can find in a document's text.
 * `provenancePrefix` identifies where the text came from
 * (e.g. "diet_plan.pdf, page 4" or "nutrition.xlsx, sheet Summary").
 */
export function extractFromText(text: string, provenancePrefix: string): TextExtraction {
  const fields: ExtractedField[] = [];
  const nutrients: ExtractedNutrient[] = [];
  const foods: ExtractedFood[] = [];
  const warnings: string[] = [];
  const detectedKeys: string[] = [];

  const pushField = (rule: FieldRule, match: RegExpMatchArray) => {
    const raw = match[0].trim();
    const value = rule.normalize ? rule.normalize(match[1], match) : match[1].trim();
    const key = rule.key;
    if (value === null || value === undefined || value === "") return;

    const conf: Confidence =
      rule.confidence ??
      confidence(/[0-9]/, raw, "high", "medium");

    fields.push({
      key,
      rawValue: raw,
      value: typeof value === "number" ? value : titleCase(String(value)),
      unit: rule.unit,
      confidence: conf,
      provenance: provenancePrefix,
      safetyRelevant: Boolean(rule.safetyRelevant),
    });
    if (!detectedKeys.includes(key)) detectedKeys.push(key);
  };

  for (const rule of [...PERSONAL_RULES, ...GOAL_RULES, ...DIET_RULES]) {
    const match = text.match(rule.pattern);
    if (match) pushField(rule, match);
  }

  // Safety fields: capture the whole list, keep it as one candidate.
  for (const rule of SAFETY_RULES) {
    const match = text.match(rule.pattern);
    if (match) pushField(rule, match);
  }

  // Nutrition label block.
  let labelDetected = 0;
  for (const rule of NUTRIENT_RULES) {
    const match = text.match(rule.pattern);
    if (!match) continue;
    const value = num(match[1]);
    if (value === null || value < 0) continue;
    nutrients.push({
      nutrient: rule.nutrient,
      value,
      unit: rule.unit,
      confidence: match[0].includes(":") ? "high" : "medium",
      provenance: provenancePrefix,
    });
    labelDetected += 1;
  }
  if (labelDetected > 0 && labelDetected < 3) {
    warnings.push(
      `Only ${labelDetected} nutrient(s) matched a label pattern — the document may not be a complete nutrition label.`,
    );
  }

  // Meals → food items.
  for (const { meal, pattern } of MEAL_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
    const items = match[1]
      .split(FOOD_SPLIT)
      .map((item) => item.trim().replace(/[.!?]+$/, ""))
      .filter((item) => item.length >= 2 && item.length <= 80 && !/^(none|nil|-|n\/?a)$/i.test(item));

    for (const item of items) {
      foods.push({
        name: titleCase(item),
        meal,
        provenance: provenancePrefix,
        confidence: match[0].includes(":") ? "high" : "medium",
      });
    }
  }

  if (fields.length === 0 && nutrients.length === 0 && foods.length === 0) {
    warnings.push(
      "No structured profile, nutrition or meal information was recognised in this document. It has been kept as reference text only.",
    );
  }

  return { fields, nutrients, foods, warnings, detectedKeys };
}

/* ------------------------------------------------------------------ */
/* Dataset detection (Part 11 routing)                                 */
/* ------------------------------------------------------------------ */

/**
 * Heuristic: does this document look like a participant DATASET rather than
 * one person's profile? Used to route CSV/XLSX/JSON to the dataset importer
 * instead of the profile review flow.
 */
export function looksLikeParticipantDataset(
  text: string,
  headers: string[] = [],
): boolean {
  const idHeader = headers.some((h) => /participant|^\s*id\s*$/i.test(h));
  const idColumn = /participant\s*id|^\s*100\d\b/im.test(text);
  const multipleRows = (text.match(/^\s*\d{4}\b/gm) ?? []).length >= 5;
  const hasNutrition = /calories|protein|carbohydrate/i.test(text);
  const hasDemographics = /\b(age|gender|height|weight)\b/i.test(text);

  return (idHeader || (idColumn && multipleRows)) && hasNutrition && hasDemographics;
}

export function isNutritionLabel(nutrients: ExtractedNutrient[]): boolean {
  const names = new Set(nutrients.map((n) => n.nutrient));
  return (
    names.has("Calories") &&
    names.has("Protein") &&
    (names.has("Carbohydrates") || names.has("Fat"))
  );
}

/* ------------------------------------------------------------------ */
/* Conflict helpers (used by the review UI)                            */
/* ------------------------------------------------------------------ */

/** Formats an extracted field's value + unit for display. */
export function formatFieldValue(field: ExtractedField): string {
  const value = field.value ?? field.rawValue;
  return field.unit ? `${value} ${field.unit}` : String(value);
}

/** Re-export so UI can build human labels from rule keys. */
export { human as labelForKey };

/** The set of profile keys that map onto the live UserProfile. */
export const PROFILE_FIELD_KEYS = [
  "age",
  "heightCm",
  "weightKg",
  "gender",
  "activityLevel",
  "goal",
  "dailyCalorieTarget",
  "proteinTargetGrams",
  "dietaryType",
] as const;
