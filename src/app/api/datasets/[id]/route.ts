/**
 * GET    /api/datasets/:id — dataset metadata + paged records + analytics.
 * DELETE /api/datasets/:id — delete the dataset and its records.
 * PATCH  /api/datasets/:id — mark the dataset as imported into the library.
 */
import {
  deleteDataset,
  getDataset,
  getDatasetRecords,
  updateDataset,
} from "@/services/server/repository";
import { currentUser, notFound, serverError, unauthorized, badRequest } from "@/services/server/guard";

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

  const url = new URL(_request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 25) || 25, 100);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0);

  const { rows, total } = await getDatasetRecords(user.id, datasetId, limit, offset);
  return Response.json({ dataset, records: rows, total });
}

export async function PATCH(request: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const datasetId = Number(id);
  if (!Number.isInteger(datasetId)) return badRequest("Invalid dataset id.");

  const body = (await request.json().catch(() => ({}))) as { imported?: boolean };
  const updated = await updateDataset(user.id, datasetId, {
    imported: body.imported === true,
  });
  if (!updated) return notFound("That dataset could not be found.");
  return Response.json({ dataset: updated });
}

export async function DELETE(_request: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const datasetId = Number(id);
  if (!Number.isInteger(datasetId)) return badRequest("Invalid dataset id.");

  const okDeleted = await deleteDataset(user.id, datasetId);
  if (!okDeleted) return serverError("The dataset could not be deleted.");
  return Response.json({ ok: true });
}
