/**
 * GET /api/datasets/:id/stats?…filters&groupBy=gender|recordStatus|nutritionStatus|activityLevel
 * Filter-aware dataset aggregates, distributions and group comparison —
 * computed in SQL, cached briefly per (user, dataset, query) to keep large
 * datasets responsive. Excluded records are omitted unless includeExcluded=1.
 */
import { currentUser, unauthorized, badRequest, notFound } from "@/services/server/guard";
import { aggregateRecords, backfillDerivedColumns, compareGroups, describeQuery, distributionRecords, parseRecordQuery } from "@/services/server/datasetRecordRepository";
import { getDataset } from "@/services/server/repository";
import { statsCache } from "@/services/dataset/statsCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
const GROUPS = ["gender", "recordStatus", "nutritionStatus", "activityLevel"] as const;

export async function GET(request: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const datasetId = Number(id);
  if (!Number.isInteger(datasetId)) return badRequest("Invalid dataset id.");

  const url = new URL(request.url);
  const query = parseRecordQuery(url.searchParams);
  const groupRaw = url.searchParams.get("groupBy") ?? "gender";
  const groupBy = (GROUPS as readonly string[]).includes(groupRaw) ? (groupRaw as (typeof GROUPS)[number]) : "gender";

  const dataset = await getDataset(user.id, datasetId);
  if (!dataset) return notFound("That dataset could not be found.");
  await backfillDerivedColumns(user.id, datasetId);

  const filters = describeQuery(query);
  const cacheKey = `${user.id}:${datasetId}:${groupBy}:${JSON.stringify({ ...query, page: 0, pageSize: 0, sort: "", direction: "" })}`;
  const payload = await statsCache.get(cacheKey, async () => {
    const [aggregates, distributions, groups] = await Promise.all([
      aggregateRecords(user.id, datasetId, query),
      distributionRecords(user.id, datasetId, query),
      compareGroups(user.id, datasetId, query, groupBy),
    ]);
    return { aggregates, distributions, groups };
  });
  if (!payload.aggregates) return notFound("That dataset could not be found.");

  const MIN_FOR_AVERAGES = 5;
  return Response.json({
    dataset: { id: dataset.id, displayName: dataset.displayName, recordCount: dataset.recordCount },
    scope: filters.length > 0 ? "selected" : "all",
    filters,
    minimumForAverages: MIN_FOR_AVERAGES,
    aggregates: payload.aggregates,
    distributions: payload.distributions,
    groupBy,
    groups: payload.groups ?? [],
  });
}
