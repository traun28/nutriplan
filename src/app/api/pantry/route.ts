/** Phase 4 — GET /api/pantry (list) · POST /api/pantry (add item). */
import { currentUser, errorResponse, readJson, unauthorized } from "@/services/server/guard";
import { createPantryItem, listPantry } from "@/services/server/kitchenRepository";
import { cleanName, parseCategory, parseDate, parseNotes, parseQuantity } from "@/services/server/kitchenHttp";
import { categoryForIngredient } from "@/data/recipes/ingredientCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  try {
    return Response.json({ items: await listPantry(user.id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const body = await readJson<Record<string, unknown>>(request);
  if (!body) return Response.json({ error: "Invalid request." }, { status: 400 });
  const name = cleanName(body.name);
  if (!name) return Response.json({ error: "Name must be 1–60 characters." }, { status: 400 });
  const qty = parseQuantity(body.quantity, body.unit);
  if (typeof qty === "string") return Response.json({ error: qty }, { status: 400 });
  const expiresOn = parseDate(body.expiresOn);
  if (expiresOn === undefined) return Response.json({ error: "Expiry must be a valid YYYY-MM-DD date." }, { status: 400 });
  const notes = parseNotes(body.notes);
  if (notes === undefined) return Response.json({ error: "Notes must be 200 characters or fewer." }, { status: 400 });
  try {
    const item = await createPantryItem(user.id, {
      name: name.toLowerCase(),
      category: body.category ? parseCategory(body.category) : categoryForIngredient(name),
      ...qty,
      expiresOn,
      notes,
    });
    return Response.json({ item }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
