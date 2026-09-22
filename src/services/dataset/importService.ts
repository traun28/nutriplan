/**
 * Phase 7 — staged import workflow.
 *
 *   POST /api/datasets            → stageUpload()   (Select → Upload → Validate)
 *   POST /api/datasets/:id/validate → revalidate()  (confirm/correct column mapping)
 *   POST /api/datasets/:id/import → commitImport()  (Import valid rows)
 *   DELETE /api/datasets/:id      → (existing) Cancel/Reject
 *
 * Until the user confirms, only the raw table + validation report are held on
 * the dataset row (status "staged"); no records exist. Rows with parse errors
 * are never imported; rows flagged incomplete / needs review are imported
 * with their status so they can be reviewed — never silently dropped.
 */
import { createDataset, getDataset, updateDataset } from "@/services/server/repository";
import { insertRecordRows } from "@/services/server/datasetRecordRepository";
import { extractTable, toRecordRow } from "@/services/dataset/ingest";
import { validateTable, type ColumnMapping, type ValidationReport } from "@/services/dataset/validation";
import { buildQualityReport } from "@/data/dataset/validator";
import { buildStatistics } from "@/data/dataset/analytics";
import type { datasets } from "@/db/schema";

type DatasetRow = typeof datasets.$inferSelect;
type StagedTable = NonNullable<DatasetRow["stagedTable"]>;
/** Dataset row as returned by the repository (the dev fallback is loosely typed). */
type AnyDatasetRow = Record<string, unknown>;
export type PublicDataset = Record<string, unknown>;

/** Strips large staged payloads before a dataset row leaves the server. */
export function publicDataset(row: AnyDatasetRow): PublicDataset {
  const { stagedTable: _staged, ...rest } = row;
  void _staged;
  return rest;
}

function stagedTableOf(row: AnyDatasetRow): StagedTable | null {
  const t = row.stagedTable as StagedTable | null | undefined;
  if (!t || !Array.isArray(t.headers) || !Array.isArray(t.rows)) return null;
  return t;
}

export interface StageResult {
  ok: boolean;
  status: number;
  error?: string;
  dataset?: PublicDataset;
  report?: ValidationReport;
  fileWarnings?: string[];
}

export async function stageUpload(userId: number, bytes: Uint8Array, fileName: string, mimeType: string): Promise<StageResult> {
  const extracted = await extractTable(bytes, fileName);
  if (!extracted.ok) {
    // Keep an honest audit row so the user sees why the file was rejected.
    const failed = await createDataset(userId, {
      fileName, displayName: fileName, kind: extracted.kind, mimeType,
      fileSizeBytes: bytes.length, status: extracted.status, statusDetail: extracted.statusDetail,
    });
    return { ok: false, status: 422, error: extracted.statusDetail, dataset: failed ? publicDataset(failed) : undefined };
  }

  const { report } = validateTable(extracted.headers, extracted.rows);
  const row = await createDataset(userId, {
    fileName,
    displayName: fileName,
    kind: extracted.kind,
    mimeType,
    fileSizeBytes: bytes.length,
    status: "staged",
    statusDetail: report.canImport
      ? `Validated ${report.quality.totalRows.toLocaleString()} row(s); ${report.quality.importableRows.toLocaleString()} can be imported. Review the report and confirm.`
      : `Validation found problems that block import: ${report.blockers[0]}`,
    recordCount: 0,
    columns: extracted.headers,
    previewRows: extracted.rows.slice(0, 10),
    warnings: extracted.warnings,
    validation: report as unknown as Record<string, unknown>,
    columnMapping: report.columns.mapping,
    stagedTable: { headers: extracted.headers, rows: extracted.rows },
  });
  if (!row) return { ok: false, status: 500, error: "The upload could not be saved." };
  return { ok: true, status: 200, dataset: publicDataset(row), report, fileWarnings: extracted.warnings };
}

export async function revalidate(userId: number, datasetId: number, mapping: ColumnMapping | null): Promise<StageResult> {
  const row = await getDataset(userId, datasetId);
  if (!row) return { ok: false, status: 404, error: "That dataset could not be found." };
  const staged = stagedTableOf(row);
  if (row.status !== "staged" || !staged) return { ok: false, status: 409, error: "This dataset has already been imported or rejected; upload the file again to change its column mapping." };

  const { headers, rows } = staged;
  const { report } = validateTable(headers, rows, mapping);
  const updated = await updateDataset(userId, datasetId, {
    validation: report as unknown as Record<string, unknown>,
    columnMapping: report.columns.mapping,
    statusDetail: report.canImport
      ? `Validated ${report.quality.totalRows.toLocaleString()} row(s); ${report.quality.importableRows.toLocaleString()} can be imported. Review the report and confirm.`
      : `Validation found problems that block import: ${report.blockers[0]}`,
  });
  return { ok: true, status: 200, dataset: updated ? publicDataset(updated) : publicDataset(row), report };
}

export interface CommitResult {
  ok: boolean;
  status: number;
  error?: string;
  dataset?: PublicDataset;
  imported?: number;
  rejected?: number;
}

export async function commitImport(userId: number, datasetId: number, options: { displayName?: string } = {}): Promise<CommitResult> {
  const row = await getDataset(userId, datasetId);
  if (!row) return { ok: false, status: 404, error: "That dataset could not be found." };
  const staged = stagedTableOf(row);
  if (row.status !== "staged" || !staged) return { ok: false, status: 409, error: "This dataset is not awaiting import." };

  const { headers, rows } = staged;
  const { report, rows: validated } = validateTable(headers, rows, (row.columnMapping as ColumnMapping | null | undefined) ?? null);
  if (!report.canImport) return { ok: false, status: 422, error: report.blockers[0] ?? "The dataset cannot be imported." };

  const importable = validated.filter((v) => v.importable);
  const rejected = validated.length - importable.length;
  const records = importable.map((v) => v.participant);
  const recordRows = importable.map((v) => toRecordRow(datasetId, v.row - 1, v.participant));

  // Mark as processing so a concurrent second click cannot double-import.
  const claimed = await updateDataset(userId, datasetId, { status: "processing", statusDetail: "Importing validated rows…" });
  if (!claimed) return { ok: false, status: 409, error: "The dataset is already being imported." };

  const inserted = await insertRecordRows(recordRows);
  if (!inserted) {
    await updateDataset(userId, datasetId, { status: "staged", statusDetail: "The records could not be saved. Try importing again." });
    return { ok: false, status: 500, error: "The records could not be saved." };
  }

  const quality = buildQualityReport(records);
  const statistics = buildStatistics(records);
  const needsReview = report.quality.recordStatus.needs_review + report.quality.recordStatus.incomplete;
  const updated = await updateDataset(userId, datasetId, {
    status: needsReview > 0 ? "needs_review" : "ready",
    statusDetail: rejected > 0
      ? `Imported ${importable.length.toLocaleString()} row(s); ${rejected.toLocaleString()} invalid row(s) were rejected and listed in the validation report.`
      : `Imported ${importable.length.toLocaleString()} row(s).`,
    displayName: options.displayName?.trim().slice(0, 120) || String(row.displayName ?? ""),
    recordCount: importable.length,
    importedRows: importable.length,
    rejectedRows: rejected,
    quality: quality as unknown as Record<string, unknown>,
    statistics: statistics as unknown as Record<string, unknown>,
    stagedTable: null,
  });
  return { ok: true, status: 200, dataset: updated ? publicDataset(updated) : undefined, imported: importable.length, rejected };
}
