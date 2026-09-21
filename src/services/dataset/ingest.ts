/**
 * Part 15 — dataset ingestion for the Dataset Management workspace.
 *
 * Takes raw bytes from an uploaded dataset file (DOCX, PDF, CSV, XLSX,
 * JSON, XML, TXT …), extracts text/tables through the Part 12 processors,
 * then converts them into NORMALISED participant records using the same
 * normaliser/validator used by the offline importer — one implementation of
 * the cleaning rules, reused rather than duplicated.
 *
 * Output is reference data only. Nothing here writes to the live user
 * profile; importing into the dataset library is an explicit user action.
 */
import { buildColumnIndex, normaliseRecord } from "@/data/dataset/normalizer";
import {
  processTxt,
  processCsv,
  processJson,
  processXml,
  processHtml,
  processRtf,
} from "@/services/attachments/processors";
import { extractDocx, extractOdt, extractPptx, extractXlsx } from "@/services/attachments/office";
import { extractPdf } from "@/services/attachments/pdf";
import { buildStatistics } from "@/data/dataset/analytics";
import {
  ATTACHMENT_LIMITS,
  detectBySignature,
  hexSignature,
  kindFromExtension,
} from "@/services/attachments/config";
import { buildQualityReport } from "@/data/dataset/validator";
import type { AttachmentKind } from "@/types/attachment";
import type {
  DatasetParticipant,
  DatasetStatistics,
  QualityReport,
} from "@/data/dataset/schema";

export type DatasetStatus =
  | "uploading"
  | "processing"
  | "ready"
  | "needs_review"
  | "failed"
  | "unsupported";

export interface IngestResult {
  status: DatasetStatus;
  statusDetail: string;
  kind: AttachmentKind;
  recordCount: number;
  columns: string[];
  previewRows: string[][];
  quality: QualityReport | null;
  statistics: DatasetStatistics | null;
  warnings: string[];
  /** Normalised records, ready to persist. */
  records: DatasetParticipant[];
  signature: string;
}

const MAX_RECORDS = 2000;

/* ------------------------------------------------------------------ */
/* Text/table extraction per format                                    */
/* ------------------------------------------------------------------ */

async function extractStructured(bytes: Uint8Array, fileName: string, kind: AttachmentKind) {
  const provenance = fileName;
  switch (kind) {
    case "pdf":
      return (await extractPdf(bytes, fileName)).extraction;
    case "docx":
      return extractDocx(bytes, fileName);
    case "pptx":
      return extractPptx(bytes, fileName);
    case "xlsx":
      return extractXlsx(bytes, fileName);
    case "odt":
      return extractOdt(bytes, fileName);
    case "csv":
      return processCsv(bytes, fileName, provenance);
    case "json":
      return processJson(bytes, fileName, provenance);
    case "xml":
      return processXml(bytes, fileName, provenance);
    case "html":
      return processHtml(bytes, fileName, provenance);
    case "rtf":
      return processRtf(bytes, fileName, provenance);
    case "txt":
      return processTxt(bytes, fileName, provenance);
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Main entry point                                                    */
/* ------------------------------------------------------------------ */

export async function ingestDataset(
  bytes: Uint8Array,
  fileName: string,
  mimeType: string,
): Promise<IngestResult> {
  const signature = hexSignature(bytes);
  const warnings: string[] = [];

  if (bytes.length === 0) {
    return fail("The file is empty.", "unsupported", signature, warnings);
  }
  if (bytes.length > ATTACHMENT_LIMITS.maxFileSizeBytes) {
    return fail(
      `The file is larger than the ${Math.round(
        ATTACHMENT_LIMITS.maxFileSizeBytes / (1024 * 1024),
      )} MB limit.`,
      "failed",
      signature,
      warnings,
    );
  }

  const byExt = kindFromExtension(fileName);
  const bySig = detectBySignature(bytes);
  let kind: AttachmentKind = bySig ?? byExt ?? "unsupported";

  // PDFs are also ZIP-free; DOCX/XLSX/PPTX/ODT are ZIPs — trust the extension there.
  if (bySig === "zip" && byExt && ["docx", "xlsx", "pptx", "odt"].includes(byExt)) {
    kind = byExt;
  }
  if (kind === "zip" || kind === "doc" || kind === "xls" || kind === "ppt") {
    return fail(
      `${kind.toUpperCase()} is not a supported dataset format. Convert it to DOCX, XLSX or CSV and upload again.`,
      "unsupported",
      signature,
      warnings,
    );
  }
  if (kind === "image") {
    return fail(
      "Image datasets cannot be read (no OCR is installed). Upload a text-readable DOCX, CSV, XLSX, PDF or JSON file.",
      "unsupported",
      signature,
      warnings,
    );
  }

  try {
    const extraction = await extractStructured(bytes, fileName, kind);
    if (!extraction) {
      return fail(
        "This format is not supported for dataset import.",
        "unsupported",
        signature,
        warnings,
      );
    }

    // ---- Build a header + row grid from whatever the format produced ----
    const table = extraction.tables?.[0];
    let headers: string[] = table?.headers ?? [];
    let rows: string[][] = table?.rows ?? [];

    // For documents without a table, fall back to "Key: Value" pairs as a
    // single logical record rather than inventing rows.
    if (rows.length === 0 && extraction.fields.length > 0) {
      headers = ["Field", "Value"];
      rows = extraction.fields.map((f) => [f.key, String(f.value ?? f.rawValue)]);
    }

    if (rows.length === 0) {
      return {
        status: "needs_review",
        statusDetail:
          "The file was read, but no dataset rows or records were detected. It has been saved for review.",
        kind,
        recordCount: 0,
        columns: headers,
        previewRows: [],
        quality: null,
        statistics: null,
        warnings: [
          "No tabular data was found in this document. A dataset usually needs a header row and repeating records.",
        ],
        records: [],
        signature,
      };
    }

    const limited = rows.slice(0, MAX_RECORDS);
    if (rows.length > limited.length) {
      warnings.push(
        `Only the first ${MAX_RECORDS.toLocaleString()} records were kept (of ${rows.length}).`,
      );
    }

    // ---- Normalise each row into a participant record ----
    const index = buildColumnIndex(headers);
    const importedAt = new Date().toISOString();
    const records: DatasetParticipant[] = [];

    for (let i = 0; i < limited.length; i += 1) {
      const row: Record<string, string> = {};
      headers.forEach((header, colIndex) => {
        row[header] = limited[i][colIndex] ?? "";
      });
      const { participant } = normaliseRecord(
        { row, sourcePage: null, sourceRow: i + 2 },
        index,
        importedAt,
      );
      records.push(participant);
    }

    const quality = buildQualityReport(records);
    const statistics = buildStatistics(records);

    const status: DatasetStatus =
      quality.cleanRecords === 0
        ? "needs_review"
        : quality.needsReviewRecords > 0
          ? "needs_review"
          : "ready";

    return {
      status,
      statusDetail:
        status === "ready"
          ? `Processed ${records.length} record(s) with no quality issues.`
          : `Processed ${records.length} record(s); ${quality.needsReviewRecords} need review.`,
      kind,
      recordCount: records.length,
      columns: headers,
      previewRows: limited.slice(0, 10),
      quality,
      statistics,
      warnings: [...warnings, ...extraction.warnings.slice(0, 5)],
      records,
      signature,
    };
  } catch (error) {
    return fail(
      `The dataset could not be read (${error instanceof Error ? error.message : "unknown error"}). The file may be corrupt or password protected.`,
      "failed",
      signature,
      warnings,
    );
  }
}

function fail(
  detail: string,
  status: DatasetStatus,
  signature: string,
  warnings: string[],
): IngestResult {
  return {
    status,
    statusDetail: detail,
    kind: "unsupported",
    recordCount: 0,
    columns: [],
    previewRows: [],
    quality: null,
    statistics: null,
    warnings,
    records: [],
    signature,
  };
}

/** Maps quality status → a persistable row shape. */
export function toRecordRows(datasetId: number, records: DatasetParticipant[]) {
  return records.map((record, index) => ({
    datasetId,
    rowIndex: index + 1,
    data: record as unknown as Record<string, unknown>,
    qualityStatus: record.quality.status,
    issues: record.quality.issues,
    calories: record.nutrition.caloriesKcal,
    protein: record.nutrition.proteinG,
    age: record.age,
    heightCm: record.heightCm,
    weightKg: record.weightKg,
    activityLevel: record.activityLevel,
  }));
}
