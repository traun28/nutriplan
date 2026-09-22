/**
 * GET /api/datasets/:id/export?format=csv|report&…filters
 *   csv    — filtered records as a CSV download (cells are escaped and
 *            formula-injection safe; no internal ids, notes or history).
 *   report — self-contained printable HTML report (dataset name, date,
 *            record count, quality summary, statistics, distribution charts as
 *            inline SVG, active filters). Print → PDF from the browser.
 */
import { currentUser, unauthorized, badRequest, notFound } from "@/services/server/guard";
import { aggregateRecords, describeQuery, distributionRecords, forEachRecord, parseRecordQuery, type DatasetRecordRow } from "@/services/server/datasetRecordRepository";
import { getDataset } from "@/services/server/repository";
import { toListItem } from "@/services/dataset/recordProjection";
import { renderReportHtml } from "@/services/dataset/reportHtml";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const CSV_COLUMNS: Array<[string, (r: ReturnType<typeof toListItem>) => unknown]> = [
  ["row", (r) => r.rowIndex + 1],
  ["participant_id", (r) => r.participantId],
  ["name", (r) => r.name],
  ["age", (r) => r.age],
  ["gender", (r) => r.gender],
  ["height_cm", (r) => r.heightCm],
  ["weight_kg", (r) => r.weightKg],
  ["bmi", (r) => r.bmi],
  ["activity_level", (r) => r.activityLevel],
  ["calories_kcal", (r) => r.calories],
  ["protein_g", (r) => r.protein],
  ["carbohydrates_g", (r) => r.carbohydratesG],
  ["fat_g", (r) => r.fatG],
  ["record_status", (r) => r.recordStatus],
  ["quality_status", (r) => r.qualityStatus],
  ["nutrition_status", (r) => r.nutritionStatus],
  ["potential_outliers", (r) => r.outlierCount],
  ["reviewed", (r) => (r.reviewed ? "yes" : "no")],
  ["excluded", (r) => (r.excluded ? "yes" : "no")],
];

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  // Neutralise spreadsheet formula injection (=, +, -, @, tab, CR).
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

function safeFileName(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 60) || "dataset";
}

export async function GET(request: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const datasetId = Number(id);
  if (!Number.isInteger(datasetId)) return badRequest("Invalid dataset id.");

  const dataset = await getDataset(user.id, datasetId);
  if (!dataset) return notFound("That dataset could not be found.");

  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "report" ? "report" : "csv";
  const query = parseRecordQuery(url.searchParams);
  const filters = describeQuery(query);
  const stamp = new Date().toISOString().slice(0, 10);
  const base = safeFileName(String(dataset.displayName ?? dataset.fileName ?? "dataset"));

  if (format === "csv") {
    const lines: string[] = [CSV_COLUMNS.map(([h]) => h).join(",")];
    const ok = await forEachRecord(user.id, datasetId, { ...query, sort: query.sort ?? "rowIndex" }, (row: DatasetRecordRow) => {
      const item = toListItem(row);
      lines.push(CSV_COLUMNS.map(([, pick]) => csvCell(pick(item))).join(","));
    });
    if (!ok) return notFound("That dataset could not be found.");
    const header = filters.length > 0 ? `# Filters: ${filters.join("; ")}\n` : "";
    return new Response(`\uFEFF${header}${lines.join("\n")}\n`, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${base}_${filters.length > 0 ? "filtered_" : ""}${stamp}.csv"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  }

  const [aggregates, distributions] = await Promise.all([
    aggregateRecords(user.id, datasetId, query),
    distributionRecords(user.id, datasetId, query),
  ]);
  if (!aggregates || !distributions) return notFound("That dataset could not be found.");
  const html = renderReportHtml({
    datasetName: String(dataset.displayName ?? dataset.fileName ?? "Dataset"),
    fileName: String(dataset.fileName ?? ""),
    uploadedAt: dataset.createdAt instanceof Date ? dataset.createdAt.toISOString() : String(dataset.createdAt ?? ""),
    generatedAt: new Date().toISOString(),
    totalRecords: Number(dataset.recordCount ?? 0),
    filters,
    aggregates,
    distributions,
  });
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `inline; filename="${base}_report_${stamp}.html"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
    },
  });
}
