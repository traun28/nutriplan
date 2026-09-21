import { getDataset, getDatasetRecords } from "@/services/server/repository";
import { analyzeDataset } from "@/services/dataset/nutritionGapAnalysis";
import { currentUser, badRequest, notFound, unauthorized } from "@/services/server/guard";
import type { DatasetParticipant } from "@/data/dataset/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const datasetId = Number(id);
  if (!Number.isInteger(datasetId)) return badRequest("Invalid dataset id.");
  const dataset = await getDataset(user.id, datasetId);
  if (!dataset) return notFound("That dataset could not be found.");

  const records: DatasetParticipant[] = [];
  const pageSize = 100;
  const recordCount = typeof dataset.recordCount === "number" ? dataset.recordCount : 0;
  for (let offset = 0; offset < recordCount; offset += pageSize) {
    const page = await getDatasetRecords(user.id, datasetId, pageSize, offset);
    records.push(...page.rows.map((row) => row.data as DatasetParticipant));
    if (page.rows.length < pageSize) break;
  }

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
    analysis: analyzeDataset(records),
  });
}
