/**
 * Part 12 — universal attachment system: canonical model.
 *
 * Separation (requirement 31):
 *   A. Live user profile  → UserProfile
 *   B. Attachment data     → AttachmentRecord (this file)
 *   C. Dataset data        → DatasetParticipant (Part 11)
 *   D. Generated plan      → DietPlan
 *
 * An attachment is a *supporting document*. Extracted values are CANDIDATES
 * only: they are reviewed by the user and explicitly imported before anything
 * touches the live profile. Attachments never overwrite safety restrictions
 * automatically (allergies, intolerances, foods to avoid).
 */

/* ------------------------------------------------------------------ */
/* Identity + limits                                                   */
/* ------------------------------------------------------------------ */

export type AttachmentKind =
  | "pdf"
  | "docx"
  | "doc"
  | "txt"
  | "rtf"
  | "odt"
  | "csv"
  | "xlsx"
  | "xls"
  | "json"
  | "xml"
  | "pptx"
  | "ppt"
  | "html"
  | "image"
  | "zip"
  | "unsupported";

export type AttachmentCategory =
  | "document"
  | "spreadsheet"
  | "structured"
  | "presentation"
  | "image"
  | "archive"
  | "other";

export type AttachmentStatus =
  | "selected"
  | "uploading"
  | "processing"
  | "extracting"
  | "ready_for_review"
  | "imported"
  | "kept_as_reference"
  | "needs_review"
  | "unsupported"
  | "failed";

export type Confidence = "high" | "medium" | "low" | "unknown";

export interface AttachmentLimits {
  maxFileSizeBytes: number;
  maxAttachments: number;
  maxTotalBytes: number;
  maxExtractedTextChars: number;
  maxCsvRows: number;
  maxSpreadsheetRows: number;
  maxArchiveEntries: number;
  maxArchiveTotalBytes: number;
  /** Images larger than this are downscaled before OCR-free text reading. */
  maxImageDimension: number;
}

/* ------------------------------------------------------------------ */
/* Extraction result (the intermediate model)                          */
/* ------------------------------------------------------------------ */

/** A structured field found in a document, with provenance + confidence. */
export interface ExtractedField {
  /** What was found, e.g. "weight", "goal", "allergen". */
  key: string;
  /** The raw text as it appeared. */
  rawValue: string;
  /** A normalised value when the key is understood, else null. */
  value: string | number | null;
  unit?: string;
  confidence: Confidence;
  /** Where it came from (page / sheet / slide / row / column). */
  provenance: string;
  /** True when the field relates to safety (allergies, avoid, restrictions). */
  safetyRelevant: boolean;
}

export interface ExtractedTable {
  id: string;
  provenance: string;
  headers: string[];
  rows: string[][];
}

export interface ExtractedNutrient {
  nutrient: string;
  value: number | null;
  unit: string;
  confidence: Confidence;
  provenance: string;
}

export interface ExtractedFood {
  name: string;
  /** Which meal slot it appeared under, if detectable. */
  meal?: string;
  provenance: string;
  confidence: Confidence;
}

export interface ExtractionResult {
  /** Plain extracted text, truncated to the configured limit. */
  text: string;
  textTruncated: boolean;
  fields: ExtractedField[];
  tables: ExtractedTable[];
  nutrients: ExtractedNutrient[];
  foods: ExtractedFood[];
  /** Detected page/slide/sheet count, where meaningful. */
  pageCount: number | null;
  /** OCR / image-based document detected but not machine-readable. */
  isLikelyScanned: boolean;
  /** Whether this looks like a participant dataset (Part 11 routing). */
  looksLikeDataset: boolean;
  warnings: string[];
}

/* ------------------------------------------------------------------ */
/* Conflict (extracted vs live profile)                                */
/* ------------------------------------------------------------------ */

export type ConflictType = "different_value" | "safety_relevant" | "new_information";

export interface ImportConflict {
  field: ExtractedField;
  /** Human-readable label, e.g. "Weight". */
  label: string;
  currentValue: string | null;
  extractedValue: string;
  conflictType: ConflictType;
  /** What would be written if the user accepts. */
  proposedValue: string | number | null;
}

/* ------------------------------------------------------------------ */
/* The stored record                                                   */
/* ------------------------------------------------------------------ */

export interface AttachmentRecord {
  attachmentId: string;
  fileName: string;
  /** Sanitised display name. */
  displayName: string;
  extension: string;
  kind: AttachmentKind;
  category: AttachmentCategory;
  mimeType: string;
  /** Sniffed magic bytes, used to detect extension/content mismatches. */
  detectedSignature: string;
  fileSizeBytes: number;
  /** SHA-256 of the bytes — duplicate detection, never a fingerprint of a person. */
  contentHash: string;
  uploadedAt: string;
  status: AttachmentStatus;
  /** Free-text reason for needs_review / unsupported / failed. */
  statusDetail: string;
  processingMs: number | null;
  extraction: ExtractionResult | null;
  /** True while the user has chosen to keep it as reference-only. */
  keptAsReference: boolean;
}

/* ------------------------------------------------------------------ */
/* Session-level report                                                */
/* ------------------------------------------------------------------ */

export interface AttachmentFailure {
  fileName: string;
  reason: string;
  recommendation: string;
}

export interface AttachmentReport {
  total: number;
  ready: number;
  failed: number;
  unsupported: number;
  skipped: number;
  failures: AttachmentFailure[];
  duplicates: string[];
  /** Total bytes accepted (for limit enforcement). */
  acceptedBytes: number;
}

export const EMPTY_EXTRACTION: ExtractionResult = {
  text: "",
  textTruncated: false,
  fields: [],
  tables: [],
  nutrients: [],
  foods: [],
  pageCount: null,
  isLikelyScanned: false,
  looksLikeDataset: false,
  warnings: [],
};
