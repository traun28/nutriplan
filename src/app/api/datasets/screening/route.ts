import { createDataset, insertDatasetRecords, listDatasets } from "@/services/server/repository";
import { currentUser, badRequest, serverError, unauthorized } from "@/services/server/guard";
import { analyzeScreeningCsv } from "@/services/dataset/healthScreening";
import { ingestDataset } from "@/services/dataset/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  const datasets = await listDatasets(user.id);
  return Response.json({ datasets: datasets.filter((dataset) => dataset.kind === "health_screening") });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const fileName = request.headers.get("x-file-name") ?? "screening.csv";
  const mimeType = request.headers.get("x-file-mime") ?? "";
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length === 0) return badRequest("The uploaded file is empty.");
  const isCsv = mimeType.includes("csv") || /\.(csv|tsv)$/i.test(fileName);
  let analysis;
  if (isCsv) {
    analysis = analyzeScreeningCsv(new TextDecoder().decode(bytes), fileName);
  } else {
    const imported = await ingestDataset(bytes, fileName, mimeType);
    const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = imported.records.map((record) => [record.name, record.age, record.heightCm, record.weightKg]);
    const extractedCsv = ["Name,Age,Height_cm,Weight_kg", ...rows.map((row) => row.map(escape).join(","))].join("\n");
    analysis = analyzeScreeningCsv(extractedCsv, fileName);
  }
  if (analysis.total === 0) return badRequest("The CSV contains no student rows.");
  const dataset = await createDataset(user.id, {
    fileName, displayName: fileName, kind: "health_screening", mimeType: "text/csv",
    fileSizeBytes: bytes.length, status: "ready", statusDetail: `Analyzed ${analysis.total} screening record(s).`,
    recordCount: analysis.total, columns: Object.keys(analysis.records[0]?.source.raw ?? {}),
    quality: { totalRecords: analysis.total, valid: analysis.valid, needsReview: analysis.needsReview, invalid: analysis.invalid },
    statistics: { averageBmi: analysis.averageBmi, bmiCounts: analysis.bmiCounts, indicatorCounts: analysis.indicatorCounts },
    previewRows: analysis.records.slice(0, 5).map((record) => [record.name, String(record.age ?? ""), String(record.calculatedBmi ?? ""), record.bmiCategory ?? "", record.indicators.join("; ")]),
    warnings: ["Screening indicators are not medical diagnoses."],
  });
  if (!dataset) return serverError("Could not save the screening dataset.");
  const inserted = await insertDatasetRecords(dataset.id, analysis.records.map((record, index) => ({ datasetId: dataset.id, rowIndex: index + 1, data: record as unknown as Record<string, unknown>, qualityStatus: record.status, issues: record.issues, calories: null, protein: null, age: record.age, heightCm: record.heightCm, weightKg: record.weightKg, activityLevel: null })));
  if (!inserted) return serverError("Could not save screening records.");
  return Response.json({ dataset, analysis });
}
