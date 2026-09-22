/**
 * GET /api/datasets/:id/records — server-side search / filter / sort / paging
 * over one dataset's records. Query params: search, ageMin, ageMax, bmiMin,
 * bmiMax, gender, recordStatus, qualityStatus, nutritionStatus, incomplete=1,
 * includeExcluded=1, reviewed=0|1, sort, direction, page, pageSize (≤100).
 */
import { currentUser, unauthorized, badRequest, notFound } from "@/services/server/guard";
import { backfillDerivedColumns, parseRecordQuery, queryRecords } from "@/services/server/datasetRecordRepository";
import { toListItem } from "@/services/dataset/recordProjection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const datasetId = Number(id);
  if (!Number.isInteger(datasetId)) return badRequest("Invalid dataset id.");

  await backfillDerivedColumns(user.id, datasetId);
  const query = parseRecordQuery(new URL(request.url).searchParams);
  const page = await queryRecords(user.id, datasetId, query);
  if (!page) return notFound("That dataset could not be found.");
  return Response.json({
    records: page.rows.map(toListItem),
    total: page.total,
    page: page.page,
    pageSize: page.pageSize,
    totalPages: page.totalPages,
    hasNext: page.page < page.totalPages,
    hasPrev: page.page > 1,
  });
}
