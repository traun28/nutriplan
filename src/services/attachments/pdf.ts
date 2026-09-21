/**
 * Part 12 — PDF text extraction.
 *
 * Uses pdf.js's LEGACY build (the same library powering Firefox's PDF
 * viewer) so we get real, page-aware text extraction without a native
 * dependency. The worker is configured from the same package, so no
 * CDN or external service is involved.
 *
 * Scanned/image-only PDFs are DETECTED, not guessed: if a page yields no
 * text layer, the document is flagged as likely scanned and the user is
 * asked for a text-readable version. We never fabricate OCR output.
 */
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ExtractionResult } from "../../types/attachment.ts";
import { EMPTY_EXTRACTION } from "../../types/attachment.ts";
import { extractFromText, looksLikeParticipantDataset } from "./engine.ts";
import { ATTACHMENT_LIMITS } from "./config.ts";

// Point pdf.js at its own worker file. In the Next.js server bundle,
// import.meta.url and createRequire cannot reliably resolve node_modules,
// so we try the absolute path from the project root.
if (typeof window === "undefined") {
  const candidates = [
    join(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"),
    join(process.cwd(), ".next/server/vendor-chunks/pdf.worker.mjs"),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (found) {
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(found).toString();
  }
} else {
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();
}

const MAX_PAGES = 100;

export interface PdfResult {
  extraction: ExtractionResult;
  pageCount: number | null;
  isScanned: boolean;
}

/**
 * Extracts text page by page. Page provenance is attached to every found
 * value so the user can see exactly where a number came from.
 */
export async function extractPdf(
  bytes: Uint8Array,
  fileName: string,
): Promise<PdfResult> {
  const loadingTask = pdfjs.getDocument({
    data: bytes,
    // We only read, never execute — disable interactive features.
    disableAutoFetch: true,
    disableStream: true,
    isEvalSupported: false,
  });

  const pdf = await loadingTask.promise;
  const pageCount = Math.min(pdf.numPages, MAX_PAGES);
  const pageTexts: Array<{ page: number; text: string }> = [];
  let emptyPages = 0;

  for (let i = 1; i <= pageCount; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (text.length > 0) {
      pageTexts.push({ page: i, text });
    } else {
      emptyPages += 1;
    }
    page.cleanup();
  }

  await pdf.destroy();

  const warnings: string[] = [];

  if (pageTexts.length === 0) {
    // No text layer at all — this is almost certainly a scanned document.
    return {
      extraction: {
        ...EMPTY_EXTRACTION,
        isLikelyScanned: true,
        warnings: [
          "This PDF appears to be scanned or image-based (no text layer). This deployment has no OCR, so its contents could not be read. Please upload a text-readable version (e.g. a PDF exported from a document, or the original DOCX/TXT).",
        ],
      },
      pageCount,
      isScanned: true,
    };
  }

  if (emptyPages > 0) {
    const ratio = emptyPages / pageCount;
    if (ratio >= 0.5) {
      warnings.push(
        `${emptyPages} of ${pageCount} page(s) have no text layer and may be scanned. Their contents could not be read.`,
      );
    }
  }

  if (pdf.numPages > MAX_PAGES) {
    warnings.push(
      `Only the first ${MAX_PAGES} of ${pdf.numPages} pages were read.`,
    );
  }

  // Run the text engine per-page so provenance is accurate, then merge.
  const fields = [];
  const nutrients = [];
  const foods = [];
  let fullText = "";

  for (const { page, text } of pageTexts) {
    const provenance = `${fileName}, page ${page}`;
    const result = extractFromText(text, provenance);
    fields.push(...result.fields);
    nutrients.push(...result.nutrients);
    foods.push(...result.foods);
    fullText += `\n[Page ${page}]\n${text}`;
  }

  const clamped =
    fullText.length > ATTACHMENT_LIMITS.maxExtractedTextChars
      ? fullText.slice(0, ATTACHMENT_LIMITS.maxExtractedTextChars)
      : fullText;

  return {
    extraction: {
      ...EMPTY_EXTRACTION,
      text: clamped,
      textTruncated: clamped.length < fullText.length,
      pageCount,
      isLikelyScanned: pageTexts.length < pageCount / 2,
      warnings,
      fields,
      nutrients,
      foods,
      looksLikeDataset: looksLikeParticipantDataset(fullText),
    },
    pageCount,
    isScanned: pageTexts.length === 0,
  };
}
