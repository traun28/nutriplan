/** Phase 4 — GET /api/recipe-favorites → the signed-in user's saved recipe ids. */
import { currentUser, errorResponse, unauthorized } from "@/services/server/guard";
import { listRecipeFavoriteIds } from "@/services/server/kitchenRepository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  try {
    return Response.json({ recipeIds: await listRecipeFavoriteIds(user.id) });
  } catch (error) {
    return errorResponse(error);
  }
}
