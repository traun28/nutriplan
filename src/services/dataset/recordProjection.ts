/**
 * Phase 7 — projections of a stored dataset record for API responses.
 * The list projection deliberately omits meals, issues text and history; the
 * detail route serves those for one record at a time.
 */
import type { DatasetRecordRow } from "@/services/server/datasetRecordRepository";
import type { DatasetParticipant } from "@/data/dataset/schema";

/** Table projection — the full normalised record is only served on the detail route. */
export function toListItem(row: DatasetRecordRow) {
  const data = row.data as DatasetParticipant;
  return {
    id: row.id,
    rowIndex: row.rowIndex,
    participantId: row.participantId ?? data.participantId ?? "",
    name: row.name ?? data.name ?? "",
    age: row.age,
    gender: row.gender ?? data.genderSource ?? "",
    heightCm: row.heightCm,
    weightKg: row.weightKg,
    bmi: row.bmi,
    activityLevel: data.activityLevelSource ?? "",
    calories: row.calories,
    protein: row.protein,
    carbohydratesG: data.nutrition?.carbohydratesG ?? null,
    fatG: data.nutrition?.fatG ?? null,
    recordStatus: row.recordStatus ?? "incomplete",
    qualityStatus: row.qualityStatus,
    nutritionStatus: row.nutritionStatus ?? "not_assessable",
    issueCount: row.issues?.length ?? 0,
    outlierCount: data.outliers?.length ?? 0,
    reviewed: row.reviewed === true,
    excluded: row.excluded === true,
  };
}

export type RecordListItem = ReturnType<typeof toListItem>;
