/**
 * Part 11 — reproducible dataset importer.
 *
 *   Provided PDF  →  extraction (data/raw/participants.tsv|.csv|.json)
 *                 →  THIS SCRIPT (parse → normalise → validate)
 *                 →  src/data/dataset/participants.clean.json
 *
 * Run it with Node 22+ (built-in TypeScript type stripping):
 *
 *   node scripts/importDataset.ts
 *   node scripts/importDataset.ts --source data/raw/participants.tsv
 *   node scripts/importDataset.ts --source X --out /tmp/check.json   (dry run)
 *
 * It imports the SAME normaliser/validator modules the application uses, so
 * the cleaning rules exist exactly once. Nothing here parses a PDF: the PDF
 * must be extracted to a delimited table first (see data/raw/README.md),
 * because reliable extraction needs the actual document.
 *
 * HONESTY RULES ENFORCED HERE
 *   • Missing values stay null — they are never invented.
 *   • Ambiguous/concatenated meal text is flagged, never guessed.
 *   • Conflicting calorie figures are recorded side by side, never corrected.
 *   • Duplicates are reported, never merged.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  buildColumnIndex,
  cleanText,
  normaliseRecord,
  type RawRecord,
} from "../src/data/dataset/normalizer.ts";
import { buildQualityReport } from "../src/data/dataset/validator.ts";
import { buildStatistics } from "../src/data/dataset/analytics.ts";
import {
  DATASET_DESCRIPTION,
  DATASET_NAME,
  DATASET_VERSION,
  PARSER_VERSION,
  SOURCE_FILE_LABEL,
  emptyLoadedDataset,
  type DatasetParticipant,
} from "../src/data/dataset/schema.ts";

/* ------------------------------------------------------------------ */
/* CLI arguments                                                       */
/* ------------------------------------------------------------------ */

interface Options {
  source: string | null;
  out: string;
  quiet: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    source: null,
    out: resolve("src/data/dataset/participants.clean.json"),
    quiet: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--source") options.source = argv[++i] ?? null;
    else if (arg === "--out") options.out = resolve(argv[++i] ?? options.out);
    else if (arg === "--quiet") options.quiet = true;
  }
  return options;
}

const DEFAULT_SOURCE_CANDIDATES = [
  "data/raw/participants.tsv",
  "data/raw/participants.csv",
  "data/raw/participants.json",
  "data/raw/participants.txt",
];

function findSource(explicit: string | null): string | null {
  if (explicit) {
    const path = resolve(explicit);
    return existsSync(path) ? path : null;
  }
  for (const candidate of DEFAULT_SOURCE_CANDIDATES) {
    const path = resolve(candidate);
    if (existsSync(path)) return path;
  }
  return null;
}

/* ------------------------------------------------------------------ */
// Delimited-text parsing (no external dependency)
/* ------------------------------------------------------------------ */

/** Splits one line honouring double-quoted fields. */
function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

interface ParsedTable {
  headers: string[];
  rows: RawRecord[];
}

/**
 * Parses TSV/CSV/TXT.
 *
 * Page provenance is optional and can be supplied either as a
 * `# page=12` marker line (common when exporting a PDF page by page) or as
 * a `_page` column. Neither is required.
 */
function parseDelimited(text: string, path: string): ParsedTable {
  const delimiter = path.toLowerCase().endsWith(".csv") ? "," : "\t";
  const lines = text.split(/\r?\n/);

  let headers: string[] = [];
  const rows: RawRecord[] = [];
  let currentPage: number | null = null;
  let lineNumber = 0;

  for (const line of lines) {
    lineNumber += 1;
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Repeated page markers (headers repeat across PDF pages).
    const pageMatch = trimmed.match(/^#\s*page[=:]\s*(\d+)/i);
    if (pageMatch) {
      currentPage = Number(pageMatch[1]);
      continue;
    }
    if (trimmed.startsWith("#")) continue;

    const cells = splitLine(trimmed, delimiter);

    if (headers.length === 0) {
      headers = cells;
      continue;
    }

    // A repeated header row on a later page: skip it, do not treat as data.
    if (cells[0] && cleanText(cells[0]).toLowerCase() === cleanText(headers[0]).toLowerCase()) {
      continue;
    }

    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });

    const pageFromColumn = row["_page"] ?? row["page"] ?? "";
    const page =
      Number.isFinite(Number(pageFromColumn)) && pageFromColumn !== ""
        ? Number(pageFromColumn)
        : currentPage;

    rows.push({ row, sourcePage: page, sourceRow: lineNumber });
  }

  return { headers, rows };
}

function parseJsonSource(text: string): ParsedTable {
  const parsed = JSON.parse(text) as unknown;
  const list = Array.isArray(parsed)
    ? parsed
    : ((parsed as { records?: unknown[] })?.records ?? []);

  if (!Array.isArray(list)) return { headers: [], rows: [] };

  const headers = Array.from(
    new Set(list.flatMap((entry) => Object.keys(entry as object))),
  );

  const rows: RawRecord[] = list.map((entry, index) => {
    const record = entry as Record<string, unknown>;
    const row: Record<string, string> = {};
    for (const header of headers) {
      const value = record[header];
      row[header] = value === null || value === undefined ? "" : String(value);
    }
    return {
      row,
      sourcePage: Number.isFinite(Number(record["_page"]))
        ? Number(record["_page"])
        : null,
      sourceRow: index + 2,
    };
  });

  return { headers, rows };
}

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

export function runImport(sourcePath: string | null) {
  const importedAt = new Date().toISOString();

  if (!sourcePath) {
    return { dataset: emptyLoadedDataset(importedAt), sourcePath: null, warnings: [
      "No source extraction found in data/raw/. The application continues to work normally; dataset features report an empty dataset.",
    ] as string[] };
  }

  const text = readFileSync(sourcePath, "utf8");
  const table = sourcePath.toLowerCase().endsWith(".json")
    ? parseJsonSource(text)
    : parseDelimited(text, sourcePath);

  const warnings: string[] = [];
  if (table.headers.length === 0) {
    warnings.push("The source file contained no header row; no records were imported.");
  }

  const index = buildColumnIndex(table.headers);
  const unrecognised = table.headers.filter(
    (header) => !header.startsWith("_") && ![...index.values()].includes(header),
  );
  if (unrecognised.length > 0) {
    warnings.push(
      `Unrecognised column(s) ignored: ${unrecognised.join(", ")}. Add an alias in mappings.ts if they are needed.`,
    );
  }

  const records: DatasetParticipant[] = [];
  const absent = new Set<string>();

  for (const raw of table.rows) {
    const result = normaliseRecord(raw, index, importedAt);
    records.push(result.participant);
    result.absentColumns.forEach((column) => absent.add(column));
  }

  if (absent.size > 0) {
    warnings.push(
      `Expected column(s) not present in the source: ${[...absent].join(", ")}.`,
    );
  }

  const qualityReport = buildQualityReport(records);
  const statistics = buildStatistics(records);

  return {
    sourcePath,
    warnings,
    statistics,
    dataset: {
      metadata: {
        datasetName: DATASET_NAME,
        datasetVersion: DATASET_VERSION,
        sourceFile: SOURCE_FILE_LABEL,
        parserVersion: PARSER_VERSION,
        importedAt,
        recordCount: records.length,
        populated: records.length > 0,
        description: DATASET_DESCRIPTION,
      },
      qualityReport,
      records,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  resolve(process.argv[1]).endsWith("importDataset.ts");

if (isMain) {
  const options = parseArgs(process.argv.slice(2));
  const sourcePath = findSource(options.source);

  if (options.source && !sourcePath) {
    console.error(`Source file not found: ${options.source}`);
    process.exit(1);
  }

  const result = runImport(sourcePath);

  mkdirSync(dirname(options.out), { recursive: true });
  writeFileSync(options.out, `${JSON.stringify(result.dataset, null, 2)}\n`, "utf8");

  if (options.quiet) process.exit(0);

  const { metadata, qualityReport } = result.dataset;
  console.log("");
  console.log("Dataset Import Summary");
  console.log("======================");
  console.log(`Source              : ${result.sourcePath ?? "(none found)"}`);
  console.log(`Output              : ${options.out}`);
  console.log(`Parser version      : ${PARSER_VERSION}`);
  console.log(`Imported at         : ${metadata.importedAt}`);
  console.log("");
  console.log(`Records detected    : ${qualityReport.totalRecords}`);
  console.log(`Records imported    : ${metadata.recordCount}`);
  console.log(`  clean             : ${qualityReport.cleanRecords}`);
  console.log(`  needs review      : ${qualityReport.needsReviewRecords}`);
  console.log(`  parse errors      : ${qualityReport.recordsWithParseErrors}`);
  console.log(`  ambiguous meals   : ${qualityReport.recordsWithAmbiguousMeals}`);
  console.log(`  missing values    : ${qualityReport.recordsWithMissingValues}`);
  console.log(`  nutrition mismatch: ${qualityReport.recordsWithNutritionInconsistency}`);
  console.log(`  possible outliers : ${qualityReport.recordsWithOutliers}`);
  console.log("");
  console.log(`Duplicate IDs       : ${qualityReport.duplicateParticipantIds.length ? qualityReport.duplicateParticipantIds.join(", ") : "none"}`);
  console.log(`Missing IDs in range: ${qualityReport.missingParticipantIds.length ? qualityReport.missingParticipantIds.join(", ") : "none"}`);
  console.log(`Duplicate names     : ${qualityReport.duplicateNames.length} (expected — names are not identifiers)`);

  if ("statistics" in result && result.statistics) {
    const stats = result.statistics;
    console.log("");
    console.log("Statistics (high-confidence records only)");
    console.log(`  sample size       : ${stats.participantSampleSize}`);
    console.log(`  average age       : ${stats.averageAge ?? "—"}`);
    console.log(`  average height cm : ${stats.averageHeightCm ?? "—"}`);
    console.log(`  average weight kg : ${stats.averageWeightKg ?? "—"}`);
    console.log(`  average BMI       : ${stats.averageBmi ?? "—"}`);
    console.log(`  average calories  : ${stats.nutrition.caloriesKcal?.mean ?? "—"}`);
  }

  if (result.warnings.length > 0) {
    console.log("");
    console.log("Warnings");
    result.warnings.forEach((warning) => console.log(`  ! ${warning}`));
  }
  console.log("");
}
