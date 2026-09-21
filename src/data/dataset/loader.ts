/**
 * Part 11 — dataset loader (application side).
 *
 * Reads the PRE-PROCESSED artifact produced by `scripts/importDataset.ts`.
 * The deployed application never parses the source PDF: extraction happens
 * once, offline, and the result is committed as JSON (requirement 28–29).
 *
 * Robustness (requirement 62): if the artifact is missing, empty or malformed,
 * `loadDataset()` returns an empty dataset rather than throwing, so the user
 * profile, nutrition processing, diet generation and dashboard all keep
 * working exactly as they did before Part 11 existed.
 */
import {
  emptyLoadedDataset,
  type DatasetParticipant,
  type LoadedDataset,
  type QualityReport,
  type DatasetMetadata,
} from "./schema.ts";
import { emptyQualityReport } from "./schema.ts";
import datasetArtifact from "./participants.clean.json";

/* ------------------------------------------------------------------ */
/* Runtime shape guard                                                 */
/* ------------------------------------------------------------------ */

function isRecordArray(value: unknown): value is DatasetParticipant[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (entry) =>
      entry !== null &&
      typeof entry === "object" &&
      typeof (entry as DatasetParticipant).participantId === "string" &&
      typeof (entry as DatasetParticipant).name === "string" &&
      (entry as DatasetParticipant).meals !== null &&
      typeof (entry as DatasetParticipant).meals === "object" &&
      (entry as DatasetParticipant).nutrition !== null &&
      typeof (entry as DatasetParticipant).nutrition === "object",
  );
}

function isMetadata(value: unknown): value is DatasetMetadata {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as DatasetMetadata).datasetName === "string" &&
    typeof (value as DatasetMetadata).recordCount === "number"
  );
}

function isReport(value: unknown): value is QualityReport {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as QualityReport).totalRecords === "number"
  );
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

let cached: LoadedDataset | null = null;

/**
 * Returns the cleaned dataset. Memoised: the artifact is static, so parsing
 * and validating it once per session is enough (no per-render work).
 */
export function loadDataset(): LoadedDataset {
  if (cached) return cached;

  const raw = datasetArtifact as unknown;

  if (raw === null || typeof raw !== "object") {
    cached = emptyLoadedDataset();
    return cached;
  }

  const candidate = raw as Partial<LoadedDataset>;
  const records = isRecordArray(candidate.records) ? candidate.records : [];

  cached = {
    metadata: isMetadata(candidate.metadata)
      ? candidate.metadata
      : emptyLoadedDataset().metadata,
    qualityReport: isReport(candidate.qualityReport)
      ? candidate.qualityReport
      : emptyQualityReport(),
    records,
  };

  // Self-heal: trust the actual array over a stale count.
  if (cached.metadata.recordCount !== records.length) {
    cached.metadata = { ...cached.metadata, recordCount: records.length };
  }
  cached.metadata.populated = records.length > 0;

  return cached;
}

/** Every record, including those flagged for review. */
export function getAllParticipants(): DatasetParticipant[] {
  return loadDataset().records;
}

export function getParticipantById(
  participantId: string,
): DatasetParticipant | null {
  const id = participantId.trim();
  if (!id) return null;
  return loadDataset().records.find((record) => record.participantId === id) ?? null;
}

/** Case-insensitive partial match on name or exact match on ID. */
export function searchParticipants(query: string, limit = 25): DatasetParticipant[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return loadDataset().records.slice(0, limit);

  return loadDataset()
    .records.filter(
      (record) =>
        record.participantId.toLowerCase().includes(needle) ||
        record.name.toLowerCase().includes(needle),
    )
    .slice(0, limit);
}

/** True when a usable dataset is present. Drives graceful UI degradation. */
export function isDatasetAvailable(): boolean {
  return loadDataset().records.length > 0;
}
