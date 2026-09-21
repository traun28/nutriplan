/**
 * Part 12 — client-safe attachment helpers.
 *
 * This module has NO server-only dependencies (no pdf.js, no jszip), so it
 * can be imported by the browser context. The actual format processing
 * happens in /api/process-attachment.
 */
import { ATTACHMENT_LIMITS, formatBytes } from "./config.ts";

/* ------------------------------------------------------------------ */
/* Hashing (SHA-256 in the browser)                                    */
/* ------------------------------------------------------------------ */

export async function hashBytes(bytes: Uint8Array): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    try {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        bytes as unknown as BufferSource,
      );
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
