/**
 * PUT    /api/food-favorites/:foodId   mark as favourite (idempotent)
 * DELETE /api/food-favorites/:foodId   remove favourite
 */
import { currentUser, errorResponse, notFound, unauthorized } from "@/services/server/guard";
import { addFavorite, removeFavorite } from "@/services/server/foodLogRepository";
import { findFood } from "@/services/foodLog/calculations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ foodId: string }> };

export async function PUT(_request: Request, context: Context) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { foodId } = await context.params;
  if (!findFood(foodId)) return notFound("That food could not be found.");
  try {
    await addFavorite(user.id, foodId);
    return Response.json({ ok: true, foodId, favorite: true });
  } catch (error) {
    return errorResponse(error, "Could not save the favourite.");
  }
}

export async function DELETE(_request: Request, context: Context) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { foodId } = await context.params;
  try {
    await removeFavorite(user.id, foodId);
    return Response.json({ ok: true, foodId, favorite: false });
  } catch (error) {
    return errorResponse(error, "Could not remove the favourite.");
  }
}
