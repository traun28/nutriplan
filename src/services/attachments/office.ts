/**
 * Part 12 — Office document extraction (DOCX, XLSX, PPTX, ODT).
 *
 * These are all ZIP containers. We use jszip to read the XML parts and
 * extract ONLY visible text — macros, embedded objects and scripts are
 * never executed or even read.
 *
 * Provenance is kept per sheet/slide/paragraph so a value can always be
 * traced back to its location in the source file.
 */
import JSZip from "jszip";
import {
  ATTACHMENT_LIMITS,
  SUGGESTED_CONVERSION,
} from "./config.ts";
import { EMPTY_EXTRACTION, type AttachmentKind, type ExtractedTable, type ExtractionResult } from "../../types/attachment.ts";
import { extractFromText, looksLikeParticipantDataset } from "./engine.ts";

/* ------------------------------------------------------------------ */
/* Shared XML text helpers                                             */
/* ------------------------------------------------------------------ */

/** Strips all tags and decodes the five basic XML entities. */
export function xmlToText(xml: string): string {
  return xml
    .replace(/<w:tab\s*\/>/g, "\t")
    .replace(/<w:br\s*\/>/g, "\n")
    .replace(/<\/(w:p|a:p|p)>|<(w:p|a:p|p)[^>]*\/>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function readZipEntry(
  zip: JSZip,
  path: string,
): Promise<string | null> {
  const file = zip.file(path);
  if (!file) return null;
  try {
    return await file.async("string");
  } catch {
    return null;
  }
}

function finalize(
  provenance: string,
  text: string,
  tables: ExtractedTable[],
  pageCount: number | null,
  warnings: string[],
): ExtractionResult {
  const clamped =
    text.length > ATTACHMENT_LIMITS.maxExtractedTextChars
      ? text.slice(0, ATTACHMENT_LIMITS.maxExtractedTextChars)
      : text;
  const engineResult = extractFromText(clamped, provenance);
  return {
    ...EMPTY_EXTRACTION,
    text: clamped,
    textTruncated: clamped.length < text.length,
    tables,
    pageCount,
    warnings: [...warnings, ...engineResult.warnings],
    fields: engineResult.fields,
    nutrients: engineResult.nutrients,
    foods: engineResult.foods,
    looksLikeDataset: looksLikeParticipantDataset(clamped, tables[0]?.headers ?? []),
  };
}

/* ------------------------------------------------------------------ */
/* DOCX                                                                */
/* ------------------------------------------------------------------ */

export async function extractDocx(
  bytes: Uint8Array,
  fileName: string,
): Promise<ExtractionResult> {
  const zip = await JSZip.loadAsync(bytes);

  const documentXml = await readZipEntry(zip, "word/document.xml");
  if (!documentXml) {
    return {
      ...EMPTY_EXTRACTION,
      warnings: ["No main document part (word/document.xml) was found. The file may be corrupt or empty."],
    };
  }

  const warnings: string[] = [];
  if (zip.file(/^word\/(embeddings|media)\//).length > 0) {
    warnings.push(
      "Embedded objects or media were present but are not read (they are never executed).",
    );
  }
  if (zip.file(/\.bin$/i).length > 0 || zip.file(/vba/i).length > 0) {
    warnings.push("This document appears macro-enabled; macros were not executed.");
  }

  const text = xmlToText(documentXml);

  // Tables become structured tables for the review UI.
  const tables: ExtractedTable[] = [];
  const tableMatches = documentXml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) ?? [];
  tableMatches.forEach((tbl, index) => {
    const rows = tbl.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) ?? [];
    if (rows.length === 0) return;
    const parsed = rows
      .slice(0, 100)
      .map((row) =>
        (row.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) ?? [])
          .map((cell) => xmlToText(cell))
          .map((cell) => cell.replace(/\n/g, " ").trim()),
      );
    const headers = parsed[0] ?? [];
    const body = parsed.slice(1).filter((r) => r.some((c) => c.length > 0));
    tables.push({
      id: `${fileName}-table-${index + 1}`,
      provenance: `${fileName}, table ${index + 1}`,
      headers,
      rows: body,
    });
  });

  return finalize(`${fileName} (DOCX)`, text, tables, null, warnings);
}

/* ------------------------------------------------------------------ */
/* PPTX                                                                */
/* ------------------------------------------------------------------ */

export async function extractPptx(
  bytes: Uint8Array,
  fileName: string,
): Promise<ExtractionResult> {
  const zip = await JSZip.loadAsync(bytes);
  const slideFiles = zip
    .file(/^ppt\/slides\/slide\d+\.xml$/)
    .sort((a, b) => {
      const num = (f: { name: string }) => Number((f.name.match(/slide(\d+)/) ?? [0, 0])[1]);
      return num(a) - num(b);
    });

  if (slideFiles.length === 0) {
    return {
      ...EMPTY_EXTRACTION,
      warnings: ["No slides were found in this presentation."],
    };
  }

  const warnings: string[] = [];
  if (zip.file(/vbaProject|vba/i).length > 0) {
    warnings.push("This presentation appears macro-enabled; macros were not executed.");
  }

  const parts: string[] = [];
  const fields = [];
  const nutrients = [];
  const foods = [];

  let slideNumber = 0;
  for (const slide of slideFiles.slice(0, 100)) {
    slideNumber += 1;
    const xml = await slide.async("string");
    const text = xmlToText(xml);
    if (!text) continue;
    const provenance = `${fileName}, slide ${slideNumber}`;
    parts.push(`[Slide ${slideNumber}]\n${text}`);
    const result = extractFromText(text, provenance);
    fields.push(...result.fields);
    nutrients.push(...result.nutrients);
    foods.push(...result.foods);
  }

  const fullText = parts.join("\n\n");
  return {
    ...EMPTY_EXTRACTION,
    text: fullText.slice(0, ATTACHMENT_LIMITS.maxExtractedTextChars),
    textTruncated: fullText.length > ATTACHMENT_LIMITS.maxExtractedTextChars,
    pageCount: slideFiles.length,
    warnings,
    fields,
    nutrients,
    foods,
    looksLikeDataset: looksLikeParticipantDataset(fullText),
  };
}

/* ------------------------------------------------------------------ */
/* XLSX                                                                */
/* ------------------------------------------------------------------ */

export async function extractXlsx(
  bytes: Uint8Array,
  fileName: string,
): Promise<ExtractionResult> {
  const zip = await JSZip.loadAsync(bytes);
  const warnings: string[] = [];
  if (zip.file(/vbaProject/i).length > 0) {
    warnings.push("This workbook appears macro-enabled; macros were not executed.");
  }

  // Shared strings (inline strings are also handled).
  const sharedXml = await readZipEntry(zip, "xl/sharedStrings.xml");
  const shared = sharedXml
    ? (sharedXml.match(/<si\b[\s\S]*?<\/si>/g) ?? []).map(xmlToText)
    : [];

  // Workbook sheet names + relationship ids.
  const workbookXml = await readZipEntry(zip, "xl/workbook.xml");
  const relsXml = await readZipEntry(zip, "xl/_rels/workbook.xml.rels");
  const sheetNames =
    workbookXml?.match(/<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g) ?? [];

  const relMap = new Map<string, string>();
  if (relsXml) {
    for (const match of relsXml.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
      relMap.set(match[1], match[2].replace(/^\//, ""));
    }
  }

  const tables: ExtractedTable[] = [];
  const textParts: string[] = [];
  let totalRows = 0;

  for (const sheetTag of sheetNames.slice(0, 10)) {
    const nameMatch = sheetTag.match(/name="([^"]+)"/);
    const ridMatch = sheetTag.match(/r:id="([^"]+)"/);
    if (!nameMatch || !ridMatch) continue;

    const name = nameMatch[1];
    const target = relMap.get(ridMatch[1]);
    if (!target) continue;

    const sheetXml = await readZipEntry(zip, `xl/${target}`);
    if (!sheetXml) continue;

    const rowTags = sheetXml.match(/<row\b[^>]*>[\s\S]*?<\/row>/g) ?? [];
    const rows: string[][] = [];

    for (const rowTag of rowTags.slice(0, ATTACHMENT_LIMITS.maxSpreadsheetRows)) {
      const cells = (rowTag.match(/<c\b[^>]*>[\s\S]*?<\/c>/g) ?? [])
        .map((cell) => {
          const type = cell.match(/t="([^"]+)"/)?.[1] ?? "n";
          const inline = cell.match(/<is\b[\s\S]*?<\/is>/)?.[0];
          const value = cell.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? "";
          if (type === "s") {
            return shared[Number(value)] ?? "";
          }
          if (inline) return xmlToText(inline);
          return value;
        });
      if (cells.some((c) => c.length > 0)) rows.push(cells);
    }

    if (rows.length === 0) continue;
    totalRows += rows.length;

    tables.push({
      id: `${fileName}-sheet-${name}`,
      provenance: `${fileName}, sheet “${name}”`,
      headers: rows[0],
      rows: rows.slice(1),
    });

    textParts.push(`[Sheet: ${name}]`);
    textParts.push(rows.map((r) => r.join(", ")).join("\n"));
  }

  if (totalRows > ATTACHMENT_LIMITS.maxSpreadsheetRows) {
    warnings.push(
      `Only the first ${ATTACHMENT_LIMITS.maxSpreadsheetRows.toLocaleString()} rows per workbook were read.`,
    );
  }

  if (tables.length === 0) {
    warnings.push("No readable sheets or rows were found in this workbook.");
  }

  const fullText = textParts.join("\n");
  return finalize(
    `${fileName} (XLSX)`,
    fullText,
    tables,
    tables.length,
    warnings,
  );
}

/* ------------------------------------------------------------------ */
/* ODT (OpenDocument Text)                                             */
/* ------------------------------------------------------------------ */

export async function extractOdt(
  bytes: Uint8Array,
  fileName: string,
): Promise<ExtractionResult> {
  const zip = await JSZip.loadAsync(bytes);
  const contentXml = await readZipEntry(zip, "content.xml");
  if (!contentXml) {
    return {
      ...EMPTY_EXTRACTION,
      warnings: ["No content.xml was found. The ODT file may be empty or corrupt."],
    };
  }

  // ODT text lives in <text:p> and <text:h> elements.
  const paragraphs = contentXml
    .replace(/<text:h\b[^>]*>/g, "\n## ")
    .replace(/<text:p\b[^>]*\/>/g, "\n")
    .replace(/<text:p\b[^>]*>/g, "\n");
  const text = xmlToText(paragraphs);

  return finalize(`${fileName} (ODT)`, text, [], null, []);
}

/* ------------------------------------------------------------------ */
/* Legacy OLE (DOC / XLS / PPT) — honest limitation                    */
/* ------------------------------------------------------------------ */

export function extractLegacyOle(
  kind: AttachmentKind,
  fileName: string,
): ExtractionResult {
  const suggestion = SUGGESTED_CONVERSION[kind] ?? "PDF or DOCX";
  return {
    ...EMPTY_EXTRACTION,
    warnings: [
      `${fileName} is a legacy ${kind.toUpperCase()} file. Reliable text extraction for this format requires a converter — please save it as ${suggestion} and upload that instead. The file has been kept as a reference.`,
    ],
  };
}
