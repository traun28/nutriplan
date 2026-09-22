/**
 * GET /api/datasets/:id/analysis?…filters — dataset nutrition gap analysis
 * ("potential gap based on recorded data"). Phase 7: filter-aware, skips
 * records the owner excluded, and adds below/above-target counts per
 * nutrient. Reuses analyzeDataset() (no second calculation engine).
 */
import { getDataset } from "@/services/server/repository";
import { analyzeDataset } from "@/services/dataset/nutritionGapAnalysis";
import { currentUser, badRequest, notFound, unauthorized } from "@/services/server/guard";
import { describeQuery, forEachRecord, parseRecordQuery } from "@/services/server/datasetRecordRepository";
import type { DatasetParticipant } from "@/data/dataset/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
const MAX_ANALYSED = 5000;

export async function GET(request: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const datasetId = Number(id);
  if (!Number.isInteger(datasetId)) return badRequest("Invalid dataset id.");
  const dataset = await getDataset(user.id, datasetId);
  if (!dataset) return notFound("That dataset could not be found.");

  const query = parseRecordQuery(new URL(request.url).searchParams);
  const records: DatasetParticipant[] = [];
  const ok = await forEachRecord(user.id, datasetId, { ...query, sort: "rowIndex", direction: "asc" }, (row) => {
    if (records.length < MAX_ANALYSED) records.push(row.data as DatasetParticipant);
  });
  if (!ok) return notFound("That dataset could not be found.");

  const analysis = analyzeDataset(records);
  const nutrientCounts = new Map<string, { label: string; unit: string; assessed: number; below: number; adequate: number; above: number }>();
  for (const p of analysis.participants) {
    for (const n of p.nutrients) {
      const bucket = nutrientCounts.get(n.key) ?? { label: n.label, unit: n.unit, assessed: 0, below: 0, adequate: 0, above: 0 };
      if (n.status !== "not_assessable") {
        bucket.assessed += 1;
        if (n.status === "below_target" || n.status === "significantly_below") bucket.below += 1;
        else if (n.status === "adequate") bucket.adequate += 1;
        else bucket.above += 1;
      }
      nutrientCounts.set(n.key, bucket);
    }
  }
  const filters = describeQuery(query);
  const recordCount = typeof dataset.recordCount === "number" ? dataset.recordCount : 0;

  return Response.json({
    dataset: {
      id: dataset.id,
      displayName: dataset.displayName,
      fileName: dataset.fileName,
      kind: dataset.kind,
      fileSizeBytes: dataset.fileSizeBytes,
      status: dataset.status,
      recordCount,
      columns: dataset.columns,
      quality: dataset.quality,
      warnings: dataset.warnings,
    },
    scope: filters.length > 0 ? "selected" : "all",
    filters,
    analysedRecords: records.length,
    truncated: records.length >= MAX_ANALYSED,
    nutrientCounts: [...nutrientCounts.entries()].map(([key, v]) => ({ key, ...v })),
    analysis,
  });
}
