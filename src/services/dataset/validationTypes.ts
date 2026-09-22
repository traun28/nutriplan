/**
 * Phase 7 — pure types + field catalogue shared by the server validator and
 * client components. No imports from the nutrition engine, so it is safe in
 * client bundles.
 */
/* ------------------------------------------------------------------ */
/* Field catalogue                                                     */
/* ------------------------------------------------------------------ */

export type FieldKind = "required" | "optional";

export interface FieldSpec {
  field: string;
  label: string;
  kind: FieldKind;
  type: "text" | "number" | "list";
  /** Plain-language expected format shown in the error report. */
  expected: string;
}

export const FIELD_CATALOGUE: FieldSpec[] = [
  { field: "participantId", label: "Participant ID", kind: "required", type: "text", expected: "A unique identifier (e.g. 1001 or S-042)" },
  { field: "name", label: "Name", kind: "required", type: "text", expected: "Display name text" },
  { field: "age", label: "Age", kind: "required", type: "number", expected: "Positive whole number of years (10–100 typical)" },
  { field: "heightCm", label: "Height (cm)", kind: "required", type: "number", expected: "Positive number in centimetres (120–220 typical)" },
  { field: "weightKg", label: "Weight (kg)", kind: "required", type: "number", expected: "Positive number in kilograms (30–200 typical)" },
  { field: "gender", label: "Gender", kind: "optional", type: "text", expected: "Male, Female or Other" },
  { field: "activityLevel", label: "Activity level", kind: "optional", type: "text", expected: "Sedentary, Light, Moderate, Active or Very active" },
  { field: "breakfast", label: "Breakfast", kind: "optional", type: "list", expected: "Food items separated by commas" },
  { field: "lunch", label: "Lunch", kind: "optional", type: "list", expected: "Food items separated by commas" },
  { field: "dinner", label: "Dinner", kind: "optional", type: "list", expected: "Food items separated by commas" },
  { field: "snacks", label: "Snacks", kind: "optional", type: "list", expected: "Food items separated by commas" },
  { field: "caloriesKcal", label: "Calories (kcal)", kind: "optional", type: "number", expected: "Non-negative number in kcal (500–6000 typical)" },
  { field: "proteinG", label: "Protein (g)", kind: "optional", type: "number", expected: "Non-negative number in grams" },
  { field: "carbohydratesG", label: "Carbohydrates (g)", kind: "optional", type: "number", expected: "Non-negative number in grams" },
  { field: "fatG", label: "Fat (g)", kind: "optional", type: "number", expected: "Non-negative number in grams" },
  { field: "dietaryFibreG", label: "Dietary fibre (g)", kind: "optional", type: "number", expected: "Non-negative number in grams" },
  { field: "sugarG", label: "Sugar (g)", kind: "optional", type: "number", expected: "Non-negative number in grams" },
  { field: "sodiumMg", label: "Sodium (mg)", kind: "optional", type: "number", expected: "Non-negative number in milligrams" },
];

const FIELD_BY_NAME = new Map(FIELD_CATALOGUE.map((spec) => [spec.field, spec]));
export const KNOWN_FIELDS = FIELD_CATALOGUE.map((spec) => spec.field);

export function fieldLabel(field: string): string {
  return FIELD_BY_NAME.get(field)?.label ?? field;
}

export type ColumnMapping = Record<string, string>;
export interface ColumnSummaryEntry {
  header: string;
  /** Field this header is mapped to, or null when it is unknown. */
  field: string | null;
  kind: FieldKind | "unknown";
  /** True when the mapping came from a loose (non-exact) alias match — shown to the user, never applied silently. */
  suggested: boolean;
  /** Suggested field for unknown headers, offered but not applied. */
  suggestion: string | null;
}
export interface ColumnValidation {
  detected: ColumnSummaryEntry[];
  required: Array<{ field: string; label: string; header: string | null; present: boolean }>;
  optional: Array<{ field: string; label: string; header: string | null; present: boolean }>;
  unknown: string[];
  missingRequired: string[];
  /** Effective mapping (header → field) the row validation used. */
  mapping: ColumnMapping;
}
export type RecordStatus = "complete" | "incomplete" | "needs_review";
export type NutritionStatus = "below_target" | "adequate" | "above_reference" | "not_assessable";
export interface RowError {
  row: number;
  field: string;
  problem: string;
  expected: string;
}
export interface FieldCompleteness {
  field: string;
  label: string;
  mapped: boolean;
  total: number;
  filled: number;
  missing: number;
  missingPercent: number;
  invalid: number;
}
export interface DuplicateGroup {
  participantId: string;
  rows: number[];
  /** Fields whose values differ between the duplicated rows (names only, no values). */
  differingFields: string[];
  identical: boolean;
}
export interface QualitySummary {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  rowsWithMissingValues: number;
  invalidNumericCells: number;
  unknownColumns: number;
  processedRows: number;
  /** Rows that would be imported when "Import valid rows" is chosen. */
  importableRows: number;
  recordStatus: Record<RecordStatus, number>;
}
export interface PreviewRow {
  row: number;
  participantId: string;
  name: string;
  age: number | null;
  gender: string;
  heightCm: number | null;
  weightKg: number | null;
  bmi: number | null;
  caloriesKcal: number | null;
  recordStatus: RecordStatus;
  issues: string[];
  duplicate: boolean;
  importable: boolean;
}
export interface ValidationReport {
  columns: ColumnValidation;
  quality: QualitySummary;
  fields: FieldCompleteness[];
  duplicates: DuplicateGroup[];
  errors: RowError[];
  errorsTruncated: boolean;
  preview: PreviewRow[];
  canImport: boolean;
  blockers: string[];
  validatedAt: string;
}
