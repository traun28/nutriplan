/**
 * Phase 7 — dataset validation layer (Select → Upload → Validate → Analyze → Import).
 *
 * Sits on top of the existing normaliser (src/data/dataset/normalizer.ts) —
 * the cleaning/validation RULES are not duplicated here. This module adds:
 *
 *   • column validation summary (detected / required / optional / unknown)
 *     plus an explicit header → field mapping the user can confirm or change;
 *   • a data-quality report (valid / invalid / duplicate / missing counts);
 *   • per-field completeness (total / filled / missing / %);
 *   • duplicate detection by identifier (never by name alone);
 *   • a row-level error report (row / field / problem / expected format);
 *   • derived per-record fields: BMI (same calculateBmi() as the rest of the
 *     app), record status (complete / incomplete / needs review) and a
 *     nutrition status relative to the calculated reference.
 *
 * Nothing here imports, deletes or modifies rows — it only describes them.
 */
import {
  buildColumnIndex,
  cleanText,
  isBlankCell,
  normaliseRecord,
  toNumberOrNull,
} from "@/data/dataset/normalizer";
import { COLUMN_ALIASES, resolveColumn } from "@/data/dataset/mappings";
import { REQUIRED_FIELDS } from "@/data/dataset/validator";
import type { DatasetParticipant } from "@/data/dataset/schema";
import { calculateBmi } from "@/services/nutrition/bmi";
import { calorieReferenceFor } from "@/services/dataset/nutritionGapAnalysis";
import {
  FIELD_CATALOGUE,
  fieldLabel,
  type ColumnMapping,
  type ColumnSummaryEntry,
  type ColumnValidation,
  type DuplicateGroup,
  type FieldCompleteness,
  type FieldKind,
  type NutritionStatus,
  type PreviewRow,
  type QualitySummary,
  type RecordStatus,
  type RowError,
  type ValidationReport,
} from "@/services/dataset/validationTypes";

export * from "@/services/dataset/validationTypes";
const FIELD_BY_NAME = new Map(FIELD_CATALOGUE.map((spec) => [spec.field, spec]));


/* ------------------------------------------------------------------ */
/* Column mapping                                                      */
/* ------------------------------------------------------------------ */

/** header → canonical field. Only headers the user (or the alias table) mapped are present. */



function normaliseHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[_\s]+/g, " ");
}

/** Loose suggestion: contains-match on aliases. Never applied automatically. */
function suggestField(header: string): string | null {
  const norm = normaliseHeader(header).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (!norm) return null;
  const words = new Set(norm.split(" "));
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const rawAlias of aliases) {
      const alias = rawAlias.replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
      if (!alias) continue;
      // Whole-word match ("student id" → id) or the alias as a phrase inside the header.
      if (words.has(alias) || (alias.length >= 3 && norm.includes(alias))) return field;
    }
  }
  return null;
}

/**
 * Builds the effective header → field mapping. Exact alias matches from the
 * documented alias table are applied automatically (they are unambiguous);
 * user overrides win; anything else is left unmapped and only *suggested*.
 */
export function buildMapping(headers: string[], override?: ColumnMapping | null): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<string>();

  // 1. Explicit user choices first (validated against the catalogue).
  if (override) {
    for (const [header, field] of Object.entries(override)) {
      if (!headers.includes(header)) continue;
      if (!FIELD_BY_NAME.has(field) || used.has(field)) continue;
      mapping[header] = field;
      used.add(field);
    }
  }
  // 2. Exact alias matches for the rest.
  for (const header of headers) {
    if (mapping[header]) continue;
    if (override && Object.prototype.hasOwnProperty.call(override, header)) continue; // user explicitly unmapped ("" value)
    const field = resolveColumn(header);
    if (field && !used.has(field)) {
      mapping[header] = field;
      used.add(field);
    }
  }
  return mapping;
}

export function summariseColumns(headers: string[], mapping: ColumnMapping): ColumnValidation {
  const fieldToHeader = new Map<string, string>();
  for (const [header, field] of Object.entries(mapping)) fieldToHeader.set(field, header);

  const detected: ColumnSummaryEntry[] = headers.map((header) => {
    const field = mapping[header] ?? null;
    const spec = field ? FIELD_BY_NAME.get(field) : undefined;
    return {
      header,
      field,
      kind: spec ? spec.kind : "unknown",
      suggested: false,
      suggestion: field ? null : suggestField(header),
    };
  });

  const required = FIELD_CATALOGUE.filter((s) => s.kind === "required").map((s) => ({
    field: s.field,
    label: s.label,
    header: fieldToHeader.get(s.field) ?? null,
    present: fieldToHeader.has(s.field),
  }));
  const optional = FIELD_CATALOGUE.filter((s) => s.kind === "optional").map((s) => ({
    field: s.field,
    label: s.label,
    header: fieldToHeader.get(s.field) ?? null,
    present: fieldToHeader.has(s.field),
  }));

  return {
    detected,
    required,
    optional,
    unknown: detected.filter((d) => d.kind === "unknown").map((d) => d.header),
    missingRequired: required.filter((r) => !r.present).map((r) => r.field),
    mapping,
  };
}

/** Converts a header→field mapping into the field→header index the normaliser expects. */
export function mappingToIndex(mapping: ColumnMapping): Map<string, string> {
  const index = new Map<string, string>();
  for (const [header, field] of Object.entries(mapping)) {
    if (!index.has(field)) index.set(field, header);
  }
  return index;
}

/* ------------------------------------------------------------------ */
/* Derived record fields                                               */
/* ------------------------------------------------------------------ */


export interface DerivedFields {
  bmi: number | null;
  recordStatus: RecordStatus;
  nutritionStatus: NutritionStatus;
}

export function deriveRecordFields(record: DatasetParticipant): DerivedFields {
  const bmi = calculateBmi(record.weightKg, record.heightCm)?.value ?? null;

  const missingRequired = REQUIRED_FIELDS.some((field) => {
    const value = record[field];
    return value === null || value === undefined || value === "";
  });

  let recordStatus: RecordStatus;
  const q = record.quality.status;
  if (q === "parse_error" || q === "ambiguous" || q === "needs_review" || record.outliers.length > 0) {
    recordStatus = "needs_review";
  } else if (missingRequired || q === "missing_value") {
    recordStatus = "incomplete";
  } else {
    recordStatus = "complete";
  }

  let nutritionStatus: NutritionStatus = "not_assessable";
  const calories = record.nutrition.caloriesKcal;
  const target = calorieReferenceFor(record);
  if (calories !== null && target !== null && target > 0) {
    const ratio = calories / target;
    nutritionStatus = ratio < 0.9 ? "below_target" : ratio <= 1.1 ? "adequate" : "above_reference";
  }

  return { bmi, recordStatus, nutritionStatus };
}

/* ------------------------------------------------------------------ */
/* Table validation                                                    */
/* ------------------------------------------------------------------ */







export interface ValidatedRow {
  row: number;
  participant: DatasetParticipant;
  derived: DerivedFields;
  duplicate: boolean;
  /** False for rows with parse errors — those are never imported silently. */
  importable: boolean;
}

export interface ValidationResult {
  report: ValidationReport;
  rows: ValidatedRow[];
}

const MAX_ERRORS = 300;
const NUMERIC_FIELDS = FIELD_CATALOGUE.filter((s) => s.type === "number").map((s) => s.field);

/** Replaces internal field keys (heightCm, caloriesKcal …) with their labels. */
function humanise(text: string): string {
  return text.replace(/\b(participantId|heightCm|weightKg|activityLevel|caloriesKcal|proteinG|carbohydratesG|fatG|dietaryFibreG|sugarG|sodiumMg)\b/g, (m) => fieldLabel(m));
}

function problemFromIssue(issue: string): { field: string; problem: string } | null {
  // Map the normaliser's plain-language issues back onto a field name.
  const patterns: Array<[RegExp, string]> = [
    [/^Participant ID/i, "participantId"],
    [/^Name /i, "name"],
    [/^Age /i, "age"],
    [/^Gender /i, "gender"],
    [/^Height /i, "heightCm"],
    [/^Weight /i, "weightKg"],
    [/^Activity level/i, "activityLevel"],
    [/^Meal field/i, "meals"],
    [/^No meals/i, "meals"],
    [/^caloriesKcal/i, "caloriesKcal"],
    [/^proteinG/i, "proteinG"],
    [/^carbohydratesG/i, "carbohydratesG"],
    [/^fatG/i, "fatG"],
    [/^dietaryFibreG/i, "dietaryFibreG"],
    [/^sugarG/i, "sugarG"],
    [/^sodiumMg/i, "sodiumMg"],
    [/^Reported calories/i, "caloriesKcal"],
    [/^Possible outlier/i, "measurements"],
  ];
  for (const [re, field] of patterns) {
    if (re.test(issue)) return { field, problem: humanise(issue) };
  }
  return { field: "record", problem: humanise(issue) };
}

/**
 * Validates a header + rows grid. `override` lets the user confirm/correct
 * the column mapping; without it only exact alias matches are applied.
 */
export function validateTable(
  headers: string[],
  rows: string[][],
  override?: ColumnMapping | null,
): ValidationResult {
  const mapping = buildMapping(headers, override);
  const columns = summariseColumns(headers, mapping);
  const index = mappingToIndex(mapping);
  const validatedAt = new Date().toISOString();

  const validated: ValidatedRow[] = [];
  const errors: RowError[] = [];
  let invalidNumericCells = 0;
  let rowsWithMissing = 0;

  const completeness = new Map<string, { filled: number; missing: number; invalid: number }>();
  for (const spec of FIELD_CATALOGUE) completeness.set(spec.field, { filled: 0, missing: 0, invalid: 0 });

  const pushError = (error: RowError) => {
    if (errors.length < MAX_ERRORS) errors.push(error);
  };

  for (let i = 0; i < rows.length; i += 1) {
    const rowNumber = i + 2; // 1-based, after the header line
    const row: Record<string, string> = {};
    headers.forEach((header, col) => {
      row[header] = rows[i][col] ?? "";
    });

    // Per-field completeness + invalid numeric cells, from the raw cells.
    for (const spec of FIELD_CATALOGUE) {
      const header = index.get(spec.field);
      if (header === undefined) continue;
      const cell = row[header] ?? "";
      const bucket = completeness.get(spec.field)!;
      if (isBlankCell(cell)) {
        bucket.missing += 1;
        continue;
      }
      if (spec.type === "number") {
        const parsed = toNumberOrNull(cell);
        const bad = parsed === null || parsed < 0 || (["age", "heightCm", "weightKg"].includes(spec.field) && parsed <= 0);
        if (bad) {
          bucket.invalid += 1;
          invalidNumericCells += 1;
          continue;
        }
      }
      bucket.filled += 1;
    }

    const { participant } = normaliseRecord({ row, sourcePage: null, sourceRow: rowNumber }, index, validatedAt);
    const derived = deriveRecordFields(participant);
    const hasParseError = participant.quality.status === "parse_error";
    const missingAnyRequired = REQUIRED_FIELDS.some((f) => {
      const v = participant[f];
      return v === null || v === "";
    });
    if (missingAnyRequired || participant.quality.issues.some((issue) => / is missing\.$/.test(issue))) rowsWithMissing += 1;

    for (const issue of participant.quality.issues) {
      const mapped = problemFromIssue(issue);
      if (!mapped) continue;
      pushError({
        row: rowNumber,
        field: mapped.field === "measurements" ? "Measurements" : mapped.field === "meals" ? "Meals" : mapped.field === "record" ? "Record" : fieldLabel(mapped.field),
        problem: mapped.problem,
        expected: FIELD_BY_NAME.get(mapped.field)?.expected ?? (mapped.field === "measurements" ? "Values inside the typical ranges; check against the source" : mapped.field === "meals" ? "Food items separated by commas" : "See column guidance"),
      });
    }

    validated.push({
      row: rowNumber,
      participant,
      derived,
      duplicate: false,
      importable: !hasParseError && Boolean(participant.participantId),
    });
  }

  /* ---- duplicates by identifier (never by name alone) ---- */
  const byId = new Map<string, ValidatedRow[]>();
  for (const v of validated) {
    const id = v.participant.participantId;
    if (!id) continue;
    const list = byId.get(id) ?? [];
    list.push(v);
    byId.set(id, list);
  }
  const duplicates: DuplicateGroup[] = [];
  const COMPARE_FIELDS: Array<keyof DatasetParticipant> = ["name", "age", "genderSource", "heightCm", "weightKg", "activityLevelSource"];
  for (const [participantId, group] of byId) {
    if (group.length < 2) continue;
    const differing = new Set<string>();
    const first = group[0].participant;
    for (const other of group.slice(1)) {
      for (const f of COMPARE_FIELDS) if (String(first[f] ?? "") !== String(other.participant[f] ?? "")) differing.add(f === "genderSource" ? "gender" : f === "activityLevelSource" ? "activityLevel" : f);
      for (const k of Object.keys(first.nutrition) as Array<keyof typeof first.nutrition>) if (first.nutrition[k] !== other.participant.nutrition[k]) differing.add(k);
    }
    // Every occurrence after the first is marked as a duplicate row. They are
    // still importable (flagged "needs review"), never dropped automatically.
    group.slice(1).forEach((v) => {
      v.duplicate = true;
      v.derived = { ...v.derived, recordStatus: "needs_review" };
      v.participant.quality.issues.push(`Duplicate participant ID "${participantId}" (also on row ${group[0].row}).`);
      v.participant.quality.needsReview = true;
      if (v.participant.quality.status === "clean") v.participant.quality.status = "needs_review";
      pushError({ row: v.row, field: "Participant ID", problem: `Duplicate participant ID "${participantId}" — first seen on row ${group[0].row}.`, expected: "Each participant ID should appear once" });
    });
    duplicates.push({
      participantId,
      rows: group.map((v) => v.row),
      differingFields: [...differing].map(fieldLabel),
      identical: differing.size === 0,
    });
  }

  /* ---- summary ---- */
  const statusCounts: Record<RecordStatus, number> = { complete: 0, incomplete: 0, needs_review: 0 };
  for (const v of validated) statusCounts[v.derived.recordStatus] += 1;
  const invalidRows = validated.filter((v) => !v.importable).length;
  const duplicateRows = validated.filter((v) => v.duplicate).length;

  const fields: FieldCompleteness[] = FIELD_CATALOGUE.map((spec) => {
    const mapped = index.has(spec.field);
    const b = completeness.get(spec.field)!;
    const total = rows.length;
    const missing = mapped ? b.missing : total;
    return {
      field: spec.field,
      label: spec.label,
      mapped,
      total,
      filled: mapped ? b.filled : 0,
      missing,
      invalid: mapped ? b.invalid : 0,
      missingPercent: total === 0 ? 0 : Math.round((missing / total) * 1000) / 10,
    };
  });

  const blockers: string[] = [];
  if (rows.length === 0) blockers.push("No data rows were found under the header row.");
  if (columns.missingRequired.length > 0) {
    blockers.push(`Required column(s) not mapped: ${columns.missingRequired.map(fieldLabel).join(", ")}. Map them below or choose a different file.`);
  }
  const importable = validated.filter((v) => v.importable).length;
  if (rows.length > 0 && importable === 0 && columns.missingRequired.length === 0) blockers.push("No rows passed validation, so there is nothing to import.");

  const preview: PreviewRow[] = validated.slice(0, 12).map((v) => ({
    row: v.row,
    participantId: v.participant.participantId,
    name: v.participant.name,
    age: v.participant.age,
    gender: v.participant.genderSource,
    heightCm: v.participant.heightCm,
    weightKg: v.participant.weightKg,
    bmi: v.derived.bmi,
    caloriesKcal: v.participant.nutrition.caloriesKcal,
    recordStatus: v.derived.recordStatus,
    issues: v.participant.quality.issues,
    duplicate: v.duplicate,
    importable: v.importable,
  }));

  const report: ValidationReport = {
    columns,
    quality: {
      totalRows: rows.length,
      validRows: rows.length - invalidRows,
      invalidRows,
      duplicateRows,
      rowsWithMissingValues: rowsWithMissing,
      invalidNumericCells,
      unknownColumns: columns.unknown.length,
      processedRows: validated.length,
      importableRows: importable,
      recordStatus: statusCounts,
    },
    fields,
    duplicates: duplicates.sort((a, b) => a.rows[0] - b.rows[0]),
    errors: errors.sort((a, b) => a.row - b.row),
    errorsTruncated: errors.length >= MAX_ERRORS,
    preview,
    canImport: blockers.length === 0,
    blockers,
    validatedAt,
  };

  return { report, rows: validated };
}

/** Validation of a single edited field value (used by the record editor). */
export function validateFieldValue(field: string, raw: unknown): { ok: true; value: string | number | null } | { ok: false; message: string } {
  const spec = FIELD_BY_NAME.get(field);
  if (!spec) return { ok: false, message: "This field cannot be edited." };
  const text = cleanText(raw);
  if (text.length > 200) return { ok: false, message: "Value is too long (200 characters max)." };
  if (spec.type === "number") {
    if (text === "") return { ok: true, value: null };
    const parsed = toNumberOrNull(text);
    if (parsed === null) return { ok: false, message: `${spec.label} must be a number. Expected: ${spec.expected}.` };
    if (parsed < 0) return { ok: false, message: `${spec.label} cannot be negative.` };
    if (["age", "heightCm", "weightKg"].includes(field) && parsed <= 0) return { ok: false, message: `${spec.label} must be greater than zero.` };
    if (field === "age" && parsed > 120) return { ok: false, message: "Age above 120 is not accepted." };
    if (field === "heightCm" && parsed > 272) return { ok: false, message: "Height above 272 cm is not accepted." };
    if (field === "weightKg" && parsed > 500) return { ok: false, message: "Weight above 500 kg is not accepted." };
    return { ok: true, value: parsed };
  }
  if (spec.kind === "required" && text === "") return { ok: false, message: `${spec.label} is required.` };
  return { ok: true, value: text };
}

export { NUMERIC_FIELDS };
