/** Phase 4 — PATCH / DELETE /api/grocery/items/:id (owner only). */
import { currentUser, errorResponse, notFound, readJson, unauthorized } from "@/services/server/guard";
import { deleteGroceryItem, updateGroceryItem } from "@/services/server/kitchenRepository";
import { cleanName, parseId, parseQuantity } from "@/services/server/kitchenHttp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const id = parseId((await context.params).id);
  if (!id) return notFound("Item not found.");
  const body = await readJson<{ purchased?: unknown; quantity?: unknown; unit?: unknown; name?: unknown }>(request);
  if (!body) return Response.json({ error: "Invalid request." }, { status: 400 });

  const patch: { purchased?: boolean; quantity?: number | null; unit?: import("@/services/grocery/units").GroceryUnit | null; name?: string } = {};
  if (body.purchased !== undefined) {
    if (typeof body.purchased !== "boolean") return Response.json({ error: "Invalid request." }, { status: 400 });
    patch.purchased = body.purchased;
  }
  if (body.quantity !== undefined || body.unit !== undefined) {
    const qty = parseQuantity(body.quantity, body.unit);
    if (typeof qty === "string") return Response.json({ error: qty }, { status: 400 });
    patch.quantity = qty.quantity;
    patch.unit = qty.unit;
  }
  if (body.name !== undefined) {
    const name = cleanName(body.name);
    if (!name) return Response.json({ error: "Name must be 1–60 characters." }, { status: 400 });
    patch.name = name.toLowerCase();
  }
  try {
    const item = await updateGroceryItem(user.id, id, patch);
    return item ? Response.json({ item }) : notFound("Item not found.");
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const id = parseId((await context.params).id);
  if (!id) return notFound("Item not found.");
  try {
    return (await deleteGroceryItem(user.id, id)) ? Response.json({ ok: true }) : notFound("Item not found.");
  } catch (error) {
    return errorResponse(error);
  }
}
