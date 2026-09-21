/**
 * Part 12 — per-format text extractors.
 *
 * Each processor is responsible for ONE thing: turning bytes into clean
 * text (+ tables where the format supports them). Structured-value
 * recognition happens afterwards in engine.ts, so no extraction rule is
 * duplicated between formats.
 *
 * Safety:
 *   - nothing here ever executes a file (no macros, no scripts, no HTML JS)
 *   - text is length-limited
 *   - every parser is wrapped by the pipeline so a malformed file becomes
 *     a friendly failure instead of a crash
 */
import { ATTACHMENT_LIMITS } from "./config.ts";
import {
  EMPTY_EXTRACTION,
  type AttachmentKind,
  type ExtractedTable,
  type ExtractionResult,
} from "../../types/attachment.ts";
import {
  extractFromText,
  looksLikeParticipantDataset,
} from "./engine.ts";

/* ------------------------------------------------------------------ */
/* Shared helper                                                       */
/* ------------------------------------------------------------------ */

/** Every processor ends here: clamp text, run the engine, package result. */
function finalize(
  provenance: string,
  text: string,
  tables: ExtractedTable[],
  pageCount: number | null,
  isLikelyScanned: boolean,
  warnings: string[],
): ExtractionResult {
  const clamped =
    text.length > ATTACHMENT_LIMITS.maxExtractedTextChars
      ? text.slice(0, ATTACHMENT_LIMITS.maxExtractedTextChars)
      : text;
  const truncated = clamped.length < text.length;
  const engineResult = extractFromText(clamped, provenance);

  return {
    ...EMPTY_EXTRACTION,
    text: clamped,
    textTruncated: truncated,
    tables,
    pageCount,
    isLikelyScanned,
    warnings: [...warnings, ...engineResult.warnings],
    fields: engineResult.fields,
    nutrients: engineResult.nutrients,
    foods: engineResult.foods,
    looksLikeDataset: looksLikeParticipantDataset(clamped, tables[0]?.headers ?? []),
  };
}

function empty(warnings: string[], provenance: string): ExtractionResult {
  return {
    ...EMPTY_EXTRACTION,
    warnings,
    text: "",
    looksLikeDataset: false,
  };
}

/* ------------------------------------------------------------------ */
/* TXT / text                                                          */
/* ------------------------------------------------------------------ */

export function processTxt(bytes: Uint8Array, _fileName: string, provenance: string) {
  const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  return finalize(provenance, decoded, [], null, false, []);
}

/* ------------------------------------------------------------------ */
/* RTF — strip control groups, keep visible text                       */
/* ------------------------------------------------------------------ */

export function processRtf(bytes: Uint8Array, _fileName: string, provenance: string) {
  const raw = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (!raw.startsWith("{\\rtf")) {
    return empty(["The file has an .rtf extension but is not RTF content."], provenance);
  }

  const text = raw
    .replace(/\\'([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\par[d]?\b/gi, "\n")
    .replace(/\\[a-zA-Z]+-?\d* ?/g, "")
    .replace(/[{}]/g, "")
    .replace(/\\\n/g, "\n");

  return finalize(provenance, text, [], null, false, []);
}

/* ------------------------------------------------------------------ */
/* HTML — visible text only, scripts and styles removed                */
/* ------------------------------------------------------------------ */

export function processHtml(bytes: Uint8Array, _fileName: string, provenance: string) {
  const raw = new TextDecoder("utf-8", { fatal: false }).decode(bytes);

  const text = raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return finalize(provenance, text, [], null, false, [
    "Scripts and styles were stripped; visible text only was read.",
  ]);
}

/* ------------------------------------------------------------------ */
/* JSON                                                                */
/* ------------------------------------------------------------------ */

export function processJson(bytes: Uint8Array, _fileName: string, provenance: string) {
  const raw = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return empty(
      [
        `The JSON could not be parsed (${error instanceof Error ? error.message : "invalid syntax"}). It has been kept as reference text.`,
      ],
      provenance,
    );
  }

  const lines: string[] = [];
  const render = (value: unknown, indent: number, depth: number) => {
    if (depth > 6) {
      lines.push(`${" ".repeat(indent)}…`);
      return;
    }
    if (value === null) lines.push(`${" ".repeat(indent)}null`);
    else if (typeof value === "object" && !Array.isArray(value)) {
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        if (val !== null && typeof val === "object") {
          lines.push(`${" ".repeat(indent)}${key}:`);
          render(val, indent + 2, depth + 1);
        } else {
          lines.push(`${" ".repeat(indent)}${key}: ${String(val)}`);
        }
      }
    } else if (Array.isArray(value)) {
      lines.push(`${" ".repeat(indent)}[${value.length} items]`);
      if (depth < 4) value.slice(0, 20).forEach((item) => render(item, indent + 2, depth + 1));
    } else {
      lines.push(`${" ".repeat(indent)}${String(value)}`);
    }
  };

  const warnings: string[] = [];
  if (Array.isArray(parsed) && looksLikeParticipantDataset(JSON.stringify(parsed))) {
    warnings.push(
      "This looks like a participant dataset rather than one person's profile. Use the dataset importer (scripts/importDataset.ts) to add it to the reference dataset — it is not imported into your profile.",
    );
  }

  render(parsed, 0, 0);
  return finalize(provenance, lines.join("\n"), [], null, false, warnings);
}

/* ------------------------------------------------------------------ */
/* XML — element text only, never executed                             */
/* ------------------------------------------------------------------ */

export function processXml(bytes: Uint8Array, _fileName: string, provenance: string) {
  const raw = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const warnings: string[] = [];

  // Extract <tag>value</tag> pairs as "tag: value" so labels survive
  // tag stripping (important for structured XML records).
  const pairs: string[] = [];
  const tagPattern = /<([\w:.-]+)\b[^>]*>([^<]{1,200})<\/\1>/g;
  let tagMatch;
  while ((tagMatch = tagPattern.exec(raw)) !== null) {
    const tag = tagMatch[1].replace(/[:._-]/g, " ").trim();
    const value = tagMatch[2].trim();
    if (value && !/^\s*$/.test(value)) {
      pairs.push(`${tag}: ${value}`);
    }
  }

  const text = [
    pairs.join("\n"),
    raw
      .replace(/<\?[\s\S]*?\?>/g, "")
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  ]
    .filter(Boolean)
    .join("\n\n");

  if (!/^<\s*[\w:-]+/.test(raw)) {
    warnings.push("The file has an .xml extension but does not start with an XML element.");
  }

  return finalize(provenance, text, [], null, false, warnings);
}

/* ------------------------------------------------------------------ */
/* CSV / TSV                                                           */
/* ------------------------------------------------------------------ */

export function processCsv(bytes: Uint8Array, fileName: string, provenance: string) {
  const raw = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const firstLine = raw.split("\n")[0] ?? "";
  const delimiter = fileName.toLowerCase().endsWith(".tsv") || firstLine.includes("\t") ? "\t" : ",";
  const warnings: string[] = [];

  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return empty(["The CSV is empty."], provenance);

  const split = (line: string): string[] => {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else inQuotes = !inQuotes;
        continue;
      }
      if (char === delimiter && !inQuotes) {
        cells.push(current.trim());
        current = "";
        continue;
      }
      current += char;
    }
    cells.push(current.trim());
    return cells;
  };

  const headers = split(lines[0]);
  const tableRows: string[][] = [];
  let malformed = 0;

  for (const line of lines.slice(1, ATTACHMENT_LIMITS.maxCsvRows + 1)) {
    const cells = split(line);
    if (Math.abs(cells.length - headers.length) > 1) {
      malformed += 1;
      continue;
    }
    tableRows.push(cells);
  }

  if (lines.length - 1 > ATTACHMENT_LIMITS.maxCsvRows) {
    warnings.push(
      `Only the first ${ATTACHMENT_LIMITS.maxCsvRows.toLocaleString()} rows were read (of ${lines.length - 1}).`,
    );
  }
  if (malformed > 0) {
    warnings.push(`${malformed} row(s) had an unexpected column count and were skipped.`);
  }

  const table: ExtractedTable = {
    id: `${fileName}-table-1`,
    provenance,
    headers,
    rows: tableRows,
  };

  const text = lines.slice(0, ATTACHMENT_LIMITS.maxCsvRows + 1).join("\n");
  return finalize(provenance, text, [table], null, false, warnings);
}

/* ------------------------------------------------------------------ */
/* Image — no OCR in this deployment. Keep the preview; be explicit.   */
/* ------------------------------------------------------------------ */

export function processImage(bytes: Uint8Array, _fileName: string, provenance: string) {
  const sig = bytes.slice(0, 4);
  const isPng = sig[0] === 0x89 && sig[1] === 0x50;
  const isJpeg = sig[0] === 0xff && sig[1] === 0xd8;
  const isWebp = sig[0] === 0x52 && sig[1] === 0x49;

  if (!isPng && !isJpeg && !isWebp) {
    return empty(
      ["The image format was not recognised. It has been kept as a reference attachment, but no text could be read."],
      provenance,
    );
  }

  // Some PNGs carry a tEXt chunk (e.g. screenshots exported by tools).
  let embeddedText = "";
  if (isPng) {
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    const textChunk = decoded.match(/tEXt[\s\S]{0,5000}/);
    if (textChunk) embeddedText = textChunk[0].slice(4).trim();
  }

  const warnings = embeddedText
    ? []
    : [
        "No OCR capability is available in this deployment, so text inside the image was not read. If this image contains a label or document, upload the text version (PDF/TXT/CSV) for accurate extraction. The image is kept as a reference.",
      ];

  return finalize(provenance, embeddedText, [], null, true, warnings);
}

/* ------------------------------------------------------------------ */
/* Unsupported formats (detected, not silently ignored)                */
/* ------------------------------------------------------------------ */

export function unsupportedResult(
  kind: AttachmentKind,
  detail: string,
  provenance: string,
): ExtractionResult {
  return empty([`${kind.toUpperCase()} is not supported by the built-in processors. ${detail}`], provenance);
}
