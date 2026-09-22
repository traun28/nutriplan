/**
 * Part 12 — attachment limits, signatures and kind metadata.
 * Centralised so nothing is hard-coded across processors or UI.
 */
import type {
  AttachmentCategory,
  AttachmentKind,
  AttachmentLimits,
} from "../../types/attachment.ts";

export const ATTACHMENT_LIMITS: AttachmentLimits = {
  maxFileSizeBytes: 10 * 1024 * 1024, // 10 MB per file
  maxAttachments: 8,
  maxTotalBytes: 40 * 1024 * 1024, // 40 MB across the session
  maxExtractedTextChars: 200_000,
  maxCsvRows: 5_000,
  maxSpreadsheetRows: 5_000,
  maxArchiveEntries: 50,
  maxArchiveTotalBytes: 25 * 1024 * 1024,
  maxImageDimension: 2048,
};

/** Magic-byte signatures (the first bytes that identify a real format). */
export const SIGNATURES: Array<{ hex: string; kind: AttachmentKind; label: string }> = [
  { hex: "25504446", kind: "pdf", label: "PDF" },
  { hex: "504b0304", kind: "zip", label: "ZIP container (docx/xlsx/pptx/odt/zip)" },
  { hex: "d0cf11e0", kind: "doc", label: "OLE container (doc/xls/ppt)" },
  { hex: "89504e47", kind: "image", label: "PNG" },
  { hex: "ffd8ff", kind: "image", label: "JPEG" },
  { hex: "52494646", kind: "image", label: "WEBP/RIFF" },
  { hex: "424d", kind: "image", label: "BMP" },
  { hex: "47494638", kind: "image", label: "GIF" },
  { hex: "3c3f786d6c", kind: "xml", label: "XML" },
  { hex: "3c68746d6c", kind: "html", label: "HTML" },
  { hex: "7b5c727466", kind: "rtf", label: "RTF" },
  { hex: "7b", kind: "json", label: "JSON (text)" },
  { hex: "5b", kind: "json", label: "JSON array (text)" },
];

export function hexSignature(bytes: Uint8Array, length = 8): string {
  return Array.from(bytes.slice(0, length))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Detects a kind from magic bytes; returns null when inconclusive. */
export function detectBySignature(bytes: Uint8Array): AttachmentKind | null {
  const hex = hexSignature(bytes);
  for (const signature of SIGNATURES) {
    if (hex.startsWith(signature.hex)) {
      // RIFF needs a WEBP check at offset 8 to not mislabel WAV/AVI.
      if (signature.hex === "52494646") {
        const tail = hexSignature(bytes.slice(8, 12), 4);
        return tail === "57454250" ? "image" : null;
      }
      return signature.kind;
    }
  }
  return null;
}

/** Extension → kind, used as a hint only (never trusted alone). */
export const EXTENSION_KIND: Record<string, AttachmentKind> = {
  pdf: "pdf",
  docx: "docx", docm: "docx",
  doc: "doc", docm_old: "doc",
  txt: "txt", text: "txt", md: "txt", log: "txt",
  rtf: "rtf",
  odt: "odt",
  csv: "csv", tsv: "csv",
  xlsx: "xlsx", xlsm: "xlsx", xlsb: "xlsx",
  xls: "xls",
  json: "json", geojson: "json",
  xml: "xml",
  pptx: "pptx", pptm: "pptx", ppsx: "pptx",
  ppt: "ppt",
  html: "html", htm: "html",
  jpg: "image", jpeg: "image", png: "image", webp: "image",
  gif: "image", bmp: "image", heic: "image", heif: "image",
  avif: "image", tiff: "image", tif: "image",
  zip: "zip",
};

export function kindFromExtension(fileName: string): AttachmentKind | null {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "docm_old") return null; // guard against the synthetic key above
  return EXTENSION_KIND[ext] ?? null;
}

export function categoryFor(kind: AttachmentKind): AttachmentCategory {
  switch (kind) {
    case "pdf":
    case "docx":
    case "doc":
    case "txt":
    case "rtf":
    case "odt":
    case "html":
      return "document";
    case "csv":
    case "xlsx":
    case "xls":
      return "spreadsheet";
    case "json":
    case "xml":
      return "structured";
    case "pptx":
    case "ppt":
      return "presentation";
    case "image":
      return "image";
    case "zip":
      return "archive";
    default:
      return "other";
  }
}

/**
 * Final kind decision: magic bytes win over the extension, but a mismatch is
 * reported as a warning rather than silently trusted.
 */
export function decideKind(
  fileName: string,
  bytes: Uint8Array,
  mimeType: string,
): { kind: AttachmentKind; mismatch: boolean; detail: string } {
  const byExt = kindFromExtension(fileName);
  const bySig = detectBySignature(bytes);

  // Macro-enabled Office files are read as their non-macro siblings.
  const macroNote = /\.(docm|xlsm|pptm)$/i.test(fileName)
    ? " Macro-enabled file: macros are never executed; only document content is read."
    : "";

  if (bySig && byExt && bySig !== byExt) {
    // ZIP containers are shared by docx/xlsx/pptx/odt/zip — trust the extension there.
    if (bySig === "zip" && ["docx", "xlsx", "pptx", "odt", "zip"].includes(byExt)) {
      return { kind: byExt, mismatch: false, detail: `ZIP container; treated as ${byExt} by extension.${macroNote}` };
    }
    return {
      kind: bySig,
      mismatch: true,
      detail: `File content looks like ${bySig.toUpperCase()}, not ${byExt.toUpperCase()} as the extension suggests. Processed by detected content.`,
    };
  }

  if (bySig) {
    // OLE covers doc/xls/ppt — the extension tells us which.
    if (bySig === "doc" && byExt && ["doc", "xls", "ppt"].includes(byExt)) {
      return { kind: byExt, mismatch: false, detail: `Legacy OLE ${byExt}.${macroNote}` };
    }
    if (bySig === "zip" && byExt) {
      return { kind: byExt, mismatch: false, detail: `ZIP container; treated as ${byExt}.${macroNote}` };
    }
    return { kind: bySig, mismatch: false, detail: `Detected ${bySig} from file signature.${macroNote}` };
  }

  // Text formats have no signature — extension + sniffed text is enough.
  if (byExt) {
    return { kind: byExt, mismatch: false, detail: `Recognised by extension and content.${macroNote}` };
  }

  // Last resort: if it smells like text, accept as txt; else unsupported.
  if (looksLikeText(bytes)) {
    return { kind: "txt", mismatch: false, detail: "Plain text content." };
  }

  return {
    kind: "unsupported",
    mismatch: false,
    detail: `Format could not be recognised (${mimeType || "unknown MIME"}).`,
  };
}

/** Cheap text sniff for extension-less files. */
export function looksLikeText(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  const sample = bytes.slice(0, 512);
  let printable = 0;
  for (const byte of sample) {
    const isPrintable =
      (byte >= 0x09 && byte <= 0x0d) ||
      (byte >= 0x20 && byte <= 0x7e) ||
      byte >= 0xc0; // common UTF-8 lead byte
    if (isPrintable) printable += 1;
  }
  return printable / sample.length > 0.85;
}

/** Sanitises a file name: no path separators, control chars or traversal. */
export function sanitizeFileName(name: string): string {
  return name
    .replace(/[\\/]+/g, "_")
    .replace(/\.\.+/g, ".")
    .replace(/[\x00-\x1f<>:"|?*]/g, "")
    .trim()
    .slice(0, 180) || "unnamed-file";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const KIND_LABEL: Record<AttachmentKind, string> = {
  pdf: "PDF",
  docx: "Word document",
  doc: "Legacy Word",
  txt: "Text",
  rtf: "Rich text",
  odt: "OpenDocument",
  csv: "CSV",
  xlsx: "Excel workbook",
  xls: "Legacy Excel",
  json: "JSON",
  xml: "XML",
  pptx: "PowerPoint",
  ppt: "Legacy PowerPoint",
  html: "HTML",
  image: "Image",
  zip: "ZIP archive",
  unsupported: "Unsupported",
};

/** Formats the app will tell users to convert to when a legacy type is limited. */
export const SUGGESTED_CONVERSION: Partial<Record<AttachmentKind, string>> = {
  doc: "DOCX, PDF or TXT",
  xls: "XLSX or CSV",
  ppt: "PPTX or PDF",
};
