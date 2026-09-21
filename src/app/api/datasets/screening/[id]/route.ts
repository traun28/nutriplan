import { getDataset, getDatasetRecords } from "@/services/server/repository";
import { currentUser, badRequest, notFound, unauthorized } from "@/services/server/guard";
import type { HealthScreeningRecord, ScreeningAnalysis } from "@/services/dataset/healthScreening";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return badRequest("Invalid screening dataset id.");
  const dataset = await getDataset(user.id, id);
  if (!dataset || dataset.kind !== "health_screening") return notFound("Screening dataset not found.");
  const page = await getDatasetRecords(user.id, id, 2000, 0);
  const records = page.rows.map((row) => row.data as HealthScreeningRecord);
  const bmiValues = records.map((record) => record.calculatedBmi).filter((value): value is number => value !== null);
  const indicatorCounts: Record<string, number> = {};
  for (const record of records) for (const indicator of record.indicators) indicatorCounts[indicator] = (indicatorCounts[indicator] ?? 0) + 1;
  const analysis: ScreeningAnalysis = {
    total: records.length,
    valid: records.filter((record) => record.status === "clean").length,
    needsReview: records.filter((record) => record.status === "needs_review").length,
    invalid: records.filter((record) => record.status === "invalid").length,
    averageBmi: bmiValues.length ? Math.round((bmiValues.reduce((sum, value) => sum + value, 0) / bmiValues.length) * 100) / 100 : null,
    bmiCounts: Object.fromEntries(["Underweight", "Normal", "Overweight", "Obese"].map((category) => [category, records.filter((record) => record.bmiCategory === category).length])),
    indicatorCounts,
    records,
  };
  return Response.json({ dataset, analysis });
}
