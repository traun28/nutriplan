/** Phase 5 — PATCH / DELETE /api/progress/:id (owner only). */
import { currentUser, errorResponse, notFound, readJson, unauthorized } from "@/services/server/guard";
import { deleteProgress, updateProgress } from "@/services/server/progressRepository";
import { parseProgressBody } from "@/services/server/progressHttp";
import { parseId } from "@/services/server/kitchenHttp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const id = parseId((await context.params).id);
  if (!id) return notFound("Entry not found.");
  const body = await readJson<Record<string, unknown>>(request);
  const parsed = parseProgressBody(body, { requireAll: false });
  if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });
  if (Object.keys(parsed).length === 0) return Response.json({ error: "Nothing to update." }, { status: 400 });
  try {
    const entry = await updateProgress(user.id, id, parsed);
    return entry ? Response.json({ entry }) : notFound("Entry not found.");
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const id = parseId((await context.params).id);
  if (!id) return notFound("Entry not found.");
  try {
    return (await deleteProgress(user.id, id)) ? Response.json({ ok: true }) : notFound("Entry not found.");
  } catch (error) {
    return errorResponse(error);
  }
}
