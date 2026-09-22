/**
 * Phase 6 — GET (transcript) / PATCH { clear: true } / DELETE for one
 * conversation. Ownership is enforced in the repository by user id.
 */
import { currentUser, errorResponse, notFound, readJson, unauthorized } from "@/services/server/guard";
import { clearConversation, deleteConversation, getConversation } from "@/services/server/aiRepository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(_request: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const id = parseId((await params).id);
  if (!id) return notFound("Conversation not found.");
  try {
    const conversation = await getConversation(user.id, id);
    if (!conversation) return notFound("Conversation not found.");
    return Response.json({ conversation });
  } catch (error) {
    return errorResponse(error, "Could not load that conversation.");
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const id = parseId((await params).id);
  if (!id) return notFound("Conversation not found.");
  const body = await readJson<{ clear?: unknown }>(request);
  if (body?.clear !== true) return Response.json({ error: "Nothing to update." }, { status: 400 });
  try {
    const ok = await clearConversation(user.id, id);
    if (!ok) return notFound("Conversation not found.");
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Could not clear that conversation.");
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const id = parseId((await params).id);
  if (!id) return notFound("Conversation not found.");
  try {
    const ok = await deleteConversation(user.id, id);
    if (!ok) return notFound("Conversation not found.");
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Could not delete that conversation.");
  }
}
