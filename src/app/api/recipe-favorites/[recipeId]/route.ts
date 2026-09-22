/** Phase 4 — PUT / DELETE /api/recipe-favorites/:recipeId (owner only). */
import { currentUser, errorResponse, notFound, unauthorized } from "@/services/server/guard";
import { addRecipeFavorite, removeRecipeFavorite } from "@/services/server/kitchenRepository";
import { getRecipe } from "@/services/recipes/recipeService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ recipeId: string }> };

export async function PUT(_request: Request, context: Context) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { recipeId } = await context.params;
  if (!getRecipe(recipeId)) return notFound("That recipe could not be found.");
  try {
    await addRecipeFavorite(user.id, recipeId);
    return Response.json({ ok: true, recipeId, favorite: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { recipeId } = await context.params;
  try {
    await removeRecipeFavorite(user.id, recipeId);
    return Response.json({ ok: true, recipeId, favorite: false });
  } catch (error) {
    return errorResponse(error);
  }
}
