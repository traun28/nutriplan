/** Phase 4 — PATCH / DELETE /api/pantry/:id (owner only). */
import { currentUser, errorResponse, notFound, readJson, unauthorized } from "@/services/server/guard";
import { deletePantryItem, updatePantryItem, type PantryWrite } from "@/services/server/kitchenRepository";
import { cleanName, parseCategory, parseDate, parseId, parseNotes, parseQuantity } from "@/services/server/kitchenHttp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const id = parseId((await context.params).id);
  if (!id) return notFound("Pantry item not found.");
  const body = await readJson<Record<string, unknown>>(request);
  if (!body) return Response.json({ error: "Invalid request." }, { status: 400 });

  const patch: Partial<PantryWrite> = {};
  if (body.name !== undefined) {
    const name = cleanName(body.name);
    if (!name) return Response.json({ error: "Name must be 1–60 characters." }, { status: 400 });
    patch.name = name.toLowerCase();
  }
  if (body.category !== undefined) patch.category = parseCategory(body.category);
  if (body.quantity !== undefined || body.unit !== undefined) {
    const qty = parseQuantity(body.quantity, body.unit);
    if (typeof qty === "string") return Response.json({ error: qty }, { status: 400 });
    patch.quantity = qty.quantity;
    patch.unit = qty.unit;
  }
  if (body.expiresOn !== undefined) {
    const d = parseDate(body.expiresOn);
    if (d === undefined) return Response.json({ error: "Expiry must be a valid YYYY-MM-DD date." }, { status: 400 });
    patch.expiresOn = d;
  }
  if (body.notes !== undefined) {
    const n = parseNotes(body.notes);
    if (n === undefined) return Response.json({ error: "Notes must be 200 characters or fewer." }, { status: 400 });
    patch.notes = n;
  }
  try {
    const item = await updatePantryItem(user.id, id, patch);
    return item ? Response.json({ item }) : notFound("Pantry item not found.");
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const id = parseId((await context.params).id);
  if (!id) return notFound("Pantry item not found.");
  try {
    return (await deletePantryItem(user.id, id)) ? Response.json({ ok: true }) : notFound("Pantry item not found.");
  } catch (error) {
    return errorResponse(error);
  }
}
