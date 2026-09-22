/** GET /api/food-favorites — the signed-in user's favourite food ids. */
import { currentUser, errorResponse, unauthorized } from "@/services/server/guard";
import { listFavoriteFoodIds } from "@/services/server/foodLogRepository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  try {
    return Response.json({ favoriteIds: await listFavoriteFoodIds(user.id) });
  } catch (error) {
    return errorResponse(error, "Could not load your favourite foods.");
  }
}
