/**
 * Part 12 — the attachment pipeline.
 *
 *   file bytes
 *     → size/limit checks
 *     → hash (duplicate detection)
 *     → kind detection (magic bytes + extension + content sniff)
 *     → format processor (never executes the file)
 *     → structured-value extraction
 *     → AttachmentRecord with provenance + confidence
 *
 * A failure at any step becomes a record with a friendly status, never a
 * thrown error that could crash the UI.
 */
import {
  ATTACHMENT_LIMITS,
  categoryFor,
  decideKind,
  formatBytes,
  hexSignature,
  KIND_LABEL,
  sanitizeFileName,
  SUGGESTED_CONVERSION,
} from "./config.ts";
import {
  processCsv,
  processHtml,
  processImage,
  processJson,
  processRtf,
  processTxt,
  processXml,
  unsupportedResult,
} from "./processors.ts";
import {
  extractDocx,
  extractLegacyOle,
  extractOdt,
  extractPptx,
  extractXlsx,
} from "./office.ts";
import { extractPdf } from "./pdf.ts";
import type {
  AttachmentKind,
  AttachmentRecord,
  AttachmentStatus,
  ExtractionResult,
} from "../../types/attachment.ts";
import { createId } from "../../lib/id.ts";

/* ------------------------------------------------------------------ */
/* Hashing (SHA-256 in the browser; FNV-1a fallback)                  */
/* ------------------------------------------------------------------ */

export async function hashBytes(bytes: Uint8Array): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    try {
      const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    } catch {
      // fall through to FNV
    }
  }
  return fnv1a(bytes);
}

function fnv1a(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv-${hash.toString(16)}`;
}

/* ------------------------------------------------------------------ */
/* Limit checks                                                        */
/* ------------------------------------------------------------------ */

export interface LimitError {
  ok: false;
  reason: string;
  recommendation: string;
}

export interface LimitOk {
  ok: true;
}

export function checkLimits(
  bytes: Uint8Array,
  fileName: string,
  existingCount: number,
  existingBytes: number,
): LimitError | LimitOk {
  if (bytes.length === 0) {
    return {
      ok: false,
      reason: `"${fileName}" is empty.`,
      recommendation: "Upload a file with actual content.",
    };
  }
  if (bytes.length > ATTACHMENT_LIMITS.maxFileSizeBytes) {
    return {
      ok: false,
      reason: `"${fileName}" is ${formatBytes(bytes.length)}, which exceeds the ${formatBytes(
        ATTACHMENT_LIMITS.maxFileSizeBytes,
      )} per-file limit.`,
      recommendation: "Compress or split the document, then upload the smaller version.",
    };
  }
  if (existingCount + 1 > ATTACHMENT_LIMITS.maxAttachments) {
    return {
      ok: false,
      reason: `You can keep at most ${ATTACHMENT_LIMITS.maxAttachments} attachments in this session.`,
      recommendation: "Remove an existing attachment before adding another.",
    };
  }
  if (existingBytes + bytes.length > ATTACHMENT_LIMITS.maxTotalBytes) {
    return {
      ok: false,
      reason: `The attachments would total ${formatBytes(
        existingBytes + bytes.length,
      )}, which exceeds the ${formatBytes(ATTACHMENT_LIMITS.maxTotalBytes)} session limit.`,
      recommendation: "Remove a large attachment before adding another.",
    };
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Processing                                                          */
/* ------------------------------------------------------------------ */

export interface ProcessOutcome {
  kind: AttachmentKind;
  status: AttachmentStatus;
  statusDetail: string;
  extraction: ExtractionResult | null;
  processingMs: number;
  signature: string;
}

export async function processFile(
  bytes: Uint8Array,
  fileName: string,
  mimeType: string,
  provenance: string,
): Promise<ProcessOutcome> {
  const started = performance.now();
  const { kind, mismatch, detail } = decideKind(fileName, bytes, mimeType);
  const signature = hexSignature(bytes);

  try {
    let extraction: ExtractionResult | null = null;

    switch (kind) {
      case "pdf":
        extraction = (await extractPdf(bytes, fileName)).extraction;
        break;
      case "docx":
        extraction = await extractDocx(bytes, fileName);
        break;
      case "pptx":
        extraction = await extractPptx(bytes, fileName);
        break;
      case "xlsx":
        extraction = await extractXlsx(bytes, fileName);
        break;
      case "odt":
        extraction = await extractOdt(bytes, fileName);
        break;
      case "doc":
      case "xls":
      case "ppt":
        extraction = extractLegacyOle(kind, fileName);
        break;
      case "txt":
        extraction = processTxt(bytes, fileName, provenance);
        break;
      case "rtf":
        extraction = processRtf(bytes, fileName, provenance);
        break;
      case "csv":
        extraction = processCsv(bytes, fileName, provenance);
        break;
      case "json":
        extraction = processJson(bytes, fileName, provenance);
        break;
      case "xml":
        extraction = processXml(bytes, fileName, provenance);
        break;
      case "html":
        extraction = processHtml(bytes, fileName, provenance);
        break;
      case "image":
        extraction = processImage(bytes, fileName, provenance);
        break;
      case "zip":
        extraction = unsupportedResult(
          "zip",
          `ZIP archives are not extracted (to protect against path traversal and archive bombs). If this archive contains a document, extract it and upload the document directly.`,
          provenance,
        );
        break;
      default:
        extraction = unsupportedResult(
          "unsupported",
          `“${fileName}” uses a format this application cannot process. Supported alternatives: PDF, DOCX, TXT, CSV, XLSX, JSON, XML, PPTX, HTML, JPG/PNG/WEBP.`,
          provenance,
        );
    }

    const processingMs = Math.round(performance.now() - started);
    const warnings = extraction?.warnings ?? [];

    // Scanned/image-only PDF is not a failure — it is a clearly explained limit.
    if (extraction?.isLikelyScanned && extraction.fields.length === 0 && extraction.text.length === 0) {
      return {
        kind,
        status: "needs_review",
        statusDetail:
          "This document appears to be scanned or image-based, so its text could not be read.",
        extraction,
        processingMs,
        signature,
      };
    }

    if (kind === "unsupported" || kind === "zip") {
      return {
        kind,
        status: "unsupported",
        statusDetail: detail,
        extraction,
        processingMs,
        signature,
      };
    }

    const needsReview =
      mismatch ||
      warnings.length > 0 ||
      (extraction?.fields.length ?? 0) === 0 && (extraction?.nutrients.length ?? 0) === 0;

    return {
      kind,
      status: needsReview ? "needs_review" : "ready_for_review",
      statusDetail:
        mismatch
          ? detail
          : warnings.length > 0
            ? warnings[0]
            : `${KIND_LABEL[kind]} processed. Review the extracted information before importing.`,
      extraction,
      processingMs,
      signature,
    };
  } catch (error) {
    const processingMs = Math.round(performance.now() - started);
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      kind,
      status: "failed",
      statusDetail: `“${fileName}” could not be processed (${message}). The file may be corrupt or password protected.`,
      extraction: null,
      processingMs,
      signature,
    };
  }
}

/* ------------------------------------------------------------------ */
/* Record builder                                                      */
/* ------------------------------------------------------------------ */

export function buildRecord(input: {
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  contentHash: string;
  outcome: ProcessOutcome;
}): AttachmentRecord {
  const extension = input.fileName.split(".").pop()?.toLowerCase() || "";
  return {
    attachmentId: createId("att"),
    fileName: input.fileName,
    displayName: sanitizeFileName(input.fileName),
    extension,
    kind: input.outcome.kind,
    category: categoryFor(input.outcome.kind),
    mimeType: input.mimeType || "application/octet-stream",
    detectedSignature: input.outcome.signature,
    fileSizeBytes: input.fileSizeBytes,
    contentHash: input.contentHash,
    uploadedAt: new Date().toISOString(),
    status: input.outcome.status,
    statusDetail: input.outcome.statusDetail,
    processingMs: input.outcome.processingMs,
    extraction: input.outcome.extraction,
    keptAsReference: false,
  };
}

export function failedRecord(
  fileName: string,
  mimeType: string,
  fileSizeBytes: number,
  contentHash: string,
  reason: string,
): AttachmentRecord {
  const extension = fileName.split(".").pop()?.toLowerCase() || "";
  const kind = "unsupported";
  return {
    attachmentId: createId("att"),
    fileName,
    displayName: sanitizeFileName(fileName),
    extension,
    kind,
    category: categoryFor(kind),
    mimeType: mimeType || "application/octet-stream",
    detectedSignature: "",
    fileSizeBytes,
    contentHash,
    uploadedAt: new Date().toISOString(),
    status: "failed",
    statusDetail: reason,
    processingMs: null,
    extraction: null,
    keptAsReference: false,
  };
}

export { SUGGESTED_CONVERSION };
