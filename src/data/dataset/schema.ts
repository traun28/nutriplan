/**
 * Part 11 — canonical dataset schema.
 *
 * IMPORTANT SEPARATION
 * --------------------
 * `DatasetParticipant` is a record from the supplied reference dataset.
 * It is NOT a `UserProfile` and is never saved as the current user's
 * profile. The two models are deliberately different shapes so they can
 * never be confused:
 *
 *   UserProfile           → what the current user entered (source of truth)
 *   DatasetParticipant    → reference/statistical data from the dataset
 *
 * This module is intentionally free of JSON imports, React and `@/` path
 * aliases so the offline importer (scripts/importDataset.mjs) can run it
 * directly in Node — one authoritative implementation of the rules.
 */
import type { ActivityLevel, Gender } from "../../types/profile.ts";

/* ------------------------------------------------------------------ */
/* Dataset identity                                                    */
/* ------------------------------------------------------------------ */

export const DATASET_NAME = "Nutrition Participant Dataset";
export const DATASET_VERSION = 1;
/** Bumped whenever the cleaning/validation rules change, for reproducibility. */
export const PARSER_VERSION = "1.0.0";
export const SOURCE_FILE_LABEL = "provided dataset PDF (extracted)";

/* ------------------------------------------------------------------ */
/* Quality flags                                                       */
/* ------------------------------------------------------------------ */

/** Ordered worst → best; a record's status is the worst issue it has. */
export const QUALITY_STATUSES = [
  "parse_error",
  "ambiguous",
  "missing_value",
  "needs_review",
  "clean",
] as const;

export type DataQualityStatus = (typeof QUALITY_STATUSES)[number];

/** Severity rank used to pick the worst status (higher = worse). */
export function qualityRank(status: DataQualityStatus): number {
  return QUALITY_STATUSES.length - 1 - QUALITY_STATUSES.indexOf(status);
}

export function worstStatus(
  a: DataQualityStatus,
  b: DataQualityStatus,
): DataQualityStatus {
  return qualityRank(a) >= qualityRank(b) ? a : b;
}

export interface DataQuality {
  status: DataQualityStatus;
  /** Plain-language explanations, safe to show on the Dataset Insights page. */
  issues: string[];
  /** Convenience mirror of `status !== "clean"`. */
  needsReview: boolean;
}

/**
 * Nutrition-consistency diagnostic (source value is never overwritten).
 * `macroDerivedCalories` = protein×4 + carbohydrates×4 + fat×9.
 */
export type NutritionConsistency =
  | "not_computable"
  | "consistent"
  | "minor_difference"
  | "inconsistent";

export interface NutritionDiagnostics {
  /** Exactly what the source document said. */
  sourceCaloriesKcal: number | null;
  macroDerivedCalories: number | null;
  /** derived − source, so a positive value means the source looks low. */
  calorieDifference: number | null;
  /** Absolute percentage difference, for thresholding. */
  calorieDifferencePercent: number | null;
  consistency: NutritionConsistency;
  /** True when any supplied nutrition value was negative and rejected. */
  rejectedValues: string[];
}

/* ------------------------------------------------------------------ */
/* Canonical record                                                    */
/* ------------------------------------------------------------------ */

export interface ParticipantMeals {
  breakfast: string[];
  lunch: string[];
  dinner: string[];
  snacks: string[];
}

export interface ParticipantNutrition {
  caloriesKcal: number | null;
  proteinG: number | null;
  carbohydratesG: number | null;
  fatG: number | null;
  dietaryFibreG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
}

/** Where a record came from — kept for traceability, not shown to users. */
export interface SourceMetadata {
  sourceFile: string;
  sourcePage: number | null;
  sourceRow: number | null;
  importedAt: string;
  parserVersion: string;
}

export interface DatasetParticipant {
  /** Primary identifier (numeric IDs 1001+ in the supplied dataset). */
  participantId: string;
  /** Cleaned display name. Never used as a key — names may repeat. */
  name: string;
  age: number | null;
  /** Exact source wording, e.g. "Male". Preserved, not reinterpreted. */
  genderSource: string;
  /** App enum where the mapping is unambiguous, otherwise null. */
  gender: Gender | null;
  heightCm: number | null;
  weightKg: number | null;
  /** Exact source wording, e.g. "Light". */
  activityLevelSource: string;
  /** App enum via `datasetActivityToApplicationActivity`. */
  activityLevel: ActivityLevel | null;
  meals: ParticipantMeals;
  nutrition: ParticipantNutrition;
  nutritionDiagnostics: NutritionDiagnostics;
  /** Flagged by outlier rules; never deleted. */
  outliers: string[];
  quality: DataQuality;
  sourceMetadata: SourceMetadata;
}

/* ------------------------------------------------------------------ */
/* Aggregates                                                          */
/* ------------------------------------------------------------------ */

export interface DatasetMetadata {
  datasetName: string;
  datasetVersion: number;
  sourceFile: string;
  parserVersion: string;
  importedAt: string;
  recordCount: number;
  /** False when no source file was available at import time. */
  populated: boolean;
  /** Honest note about what this dataset is and is not. */
  description: string;
}

export interface QualityReport {
  totalRecords: number;
  cleanRecords: number;
  needsReviewRecords: number;
  recordsWithMissingValues: number;
  recordsWithParseErrors: number;
  recordsWithAmbiguousMeals: number;
  recordsWithNutritionInconsistency: number;
  duplicateParticipantIds: string[];
  missingParticipantIds: string[];
  duplicateNames: string[];
  recordsWithOutliers: number;
  /** Counts per quality status. */
  statusCounts: Record<DataQualityStatus, number>;
  /** Issue text → how many records reported it. */
  issueFrequency: Record<string, number>;
}

export interface NutritionStatistics {
  sampleSize: number;
  caloriesKcal: StatBlock | null;
  proteinG: StatBlock | null;
  carbohydratesG: StatBlock | null;
  fatG: StatBlock | null;
  dietaryFibreG: StatBlock | null;
  sugarG: StatBlock | null;
  sodiumMg: StatBlock | null;
}

export interface StatBlock {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
}

export interface DatasetStatistics {
  participantSampleSize: number;
  nutritionSampleSize: number;
  averageAge: number | null;
  averageHeightCm: number | null;
  averageWeightKg: number | null;
  averageBmi: number | null;
  activityLevelDistribution: Record<string, number>;
  genderDistribution: Record<string, number>;
  nutrition: NutritionStatistics;
  /** Meal slot → food → number of participants mentioning it. */
  foodFrequency: Record<keyof ParticipantMeals, Array<{ food: string; count: number }>>;
}

export interface LoadedDataset {
  metadata: DatasetMetadata;
  qualityReport: QualityReport;
  records: DatasetParticipant[];
}

/* ------------------------------------------------------------------ */
/* Factories (single source of default shapes)                         */
/* ------------------------------------------------------------------ */

export function emptyMeals(): ParticipantMeals {
  return { breakfast: [], lunch: [], dinner: [], snacks: [] };
}

export function emptyNutrition(): ParticipantNutrition {
  return {
    caloriesKcal: null,
    proteinG: null,
    carbohydratesG: null,
    fatG: null,
    dietaryFibreG: null,
    sugarG: null,
    sodiumMg: null,
  };
}

export function cleanQuality(): DataQuality {
  return { status: "clean", issues: [], needsReview: false };
}

/** Empty dataset shape used when no source file has been imported yet. */
export function emptyLoadedDataset(importedAt = ""): LoadedDataset {
  return {
    metadata: {
      datasetName: DATASET_NAME,
      datasetVersion: DATASET_VERSION,
      sourceFile: SOURCE_FILE_LABEL,
      parserVersion: PARSER_VERSION,
      importedAt,
      recordCount: 0,
      populated: false,
      description: DATASET_DESCRIPTION,
    },
    qualityReport: emptyQualityReport(),
    records: [],
  };
}

export function emptyQualityReport(): QualityReport {
  return {
    totalRecords: 0,
    cleanRecords: 0,
    needsReviewRecords: 0,
    recordsWithMissingValues: 0,
    recordsWithParseErrors: 0,
    recordsWithAmbiguousMeals: 0,
    recordsWithNutritionInconsistency: 0,
    duplicateParticipantIds: [],
    missingParticipantIds: [],
    duplicateNames: [],
    recordsWithOutliers: 0,
    statusCounts: {
      parse_error: 0,
      ambiguous: 0,
      missing_value: 0,
      needs_review: 0,
      clean: 0,
    },
    issueFrequency: {},
  };
}

/**
 * Honest description shown wherever the dataset appears. It states plainly
 * that this is reference data with no clinical outcome evidence.
 */
export const DATASET_DESCRIPTION =
  "Reference participant records extracted from the supplied dataset PDF. " +
  "Nutrition values are source-provided and are not medically authoritative. " +
  "The dataset contains participant characteristics and dietary fields only — " +
  "it is not a clinical outcome study, so no causal or health-effect claim is " +
  "made from it. It is used for analytics, demonstration profiles and as one " +
  "auxiliary ranking signal; it never overrides the current user's allergies, " +
  "dietary restrictions or calculated targets.";
