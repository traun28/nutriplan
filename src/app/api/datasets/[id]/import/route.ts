/**
 * POST /api/datasets/:id/import — "Import valid rows" for a staged upload.
 * Rows with parse errors are rejected (and remain listed in the validation
 * report); incomplete / needs-review rows are imported with their status.
 */
import { currentUser, unauthorized, badRequest, readJson } from "@/services/server/guard";
import { commitImport } from "@/services/dataset/importService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const datasetId = Number(id);
  if (!Number.isInteger(datasetId)) return badRequest("Invalid dataset id.");
  const body = (await readJson<{ displayName?: unknown }>(request)) ?? {};
  const displayName = typeof body.displayName === "string" ? body.displayName : undefined;
  const result = await commitImport(user.id, datasetId, { displayName });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ dataset: result.dataset, imported: result.imported, rejected: result.rejected });
}
