/**
 * Part 11 — dataset-level validation and the quality report.
 *
 * Record-level normalisation happens in normalizer.ts; this module looks
 * ACROSS the dataset: duplicate IDs, gaps in the ID sequence, repeated
 * names, and the aggregate quality counts used on the Dataset Insights page.
 *
 * Duplicates are reported, never silently merged (requirements 24–26).
 */
import {
  emptyQualityReport,
  QUALITY_STATUSES,
  type DataQualityStatus,
  type DatasetParticipant,
  type QualityReport,
} from "./schema.ts";

/** Fields that must be present for a record to count as "high confidence". */
export const REQUIRED_FIELDS: Array<keyof DatasetParticipant> = [
  "participantId",
  "name",
  "age",
  "heightCm",
  "weightKg",
];

export interface RecordValidation {
  participantId: string;
  /** True when every required field parsed to a usable value. */
  valid: boolean;
  missingFields: string[];
  status: DataQualityStatus;
}

export function validateRecord(record: DatasetParticipant): RecordValidation {
  const missingFields = REQUIRED_FIELDS.filter((field) => {
    const value = record[field];
    return value === null || value === undefined || value === "";
  }).map((field) => String(field));

  return {
    participantId: record.participantId,
    valid: missingFields.length === 0 && record.quality.status === "clean",
    missingFields,
    status: record.quality.status,
  };
}

/**
 * True when a record is trustworthy enough to contribute to statistics.
 * Records with parse errors, ambiguity or missing required fields are
 * excluded rather than being averaged in (requirements 48, 57).
 */
export function isHighConfidence(record: DatasetParticipant): boolean {
  return validateRecord(record).valid;
}

/* ------------------------------------------------------------------ */
/* Dataset-level report                                                */
/* ------------------------------------------------------------------ */

/**
 * Detects gaps in a numeric ID sequence. Only meaningful when every ID is
 * numeric; otherwise it reports nothing rather than guessing a range.
 */
export function findMissingIds(ids: string[]): string[] {
  const numeric = ids
    .map((id) => Number(id))
    .filter((value) => Number.isInteger(value));

  if (numeric.length === 0) return [];

  const min = Math.min(...numeric);
  const max = Math.max(...numeric);
  // Guard against a nonsensical range producing a huge list.
  if (max - min > 10000) return [];

  const present = new Set(numeric);
  const missing: string[] = [];
  for (let id = min; id <= max; id += 1) {
    if (!present.has(id)) missing.push(String(id));
  }
  return missing;
}

export function findDuplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return Array.from(duplicates);
}

export function buildQualityReport(
  records: DatasetParticipant[],
): QualityReport {
  const report = emptyQualityReport();
  report.totalRecords = records.length;

  for (const record of records) {
    const { status, issues } = record.quality;
    report.statusCounts[status] += 1;

    if (status === "clean") report.cleanRecords += 1;
    if (status !== "clean") report.needsReviewRecords += 1;

    const validation = validateRecord(record);
    if (validation.missingFields.length > 0) {
      report.recordsWithMissingValues += 1;
    }
    if (status === "parse_error") report.recordsWithParseErrors += 1;
    if (status === "ambiguous") report.recordsWithAmbiguousMeals += 1;
    if (record.nutritionDiagnostics.consistency === "inconsistent") {
      report.recordsWithNutritionInconsistency += 1;
    }
    if (record.outliers.length > 0) report.recordsWithOutliers += 1;

    for (const issue of issues) {
      // Group by the leading sentence so counts stay readable.
      const bucket = issue.split(".")[0] ?? issue;
      report.issueFrequency[bucket] = (report.issueFrequency[bucket] ?? 0) + 1;
    }
  }

  report.duplicateParticipantIds = findDuplicates(
    records.map((record) => record.participantId),
  );
  report.missingParticipantIds = findMissingIds(
    records.map((record) => record.participantId),
  );
  report.duplicateNames = findDuplicates(records.map((record) => record.name));

  return report;
}

/** Human-readable ordering for the insights page. */
export const STATUS_ORDER: DataQualityStatus[] = [...QUALITY_STATUSES].reverse();
