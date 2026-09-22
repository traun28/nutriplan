/**
 * GET /api/food-logs/recent — distinct foods this user logged most
 * recently, plus their favourites, in one round-trip for the logger.
 */
import { currentUser, errorResponse, unauthorized } from "@/services/server/guard";
import { listFavoriteFoodIds, listRecentFoodIds } from "@/services/server/foodLogRepository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  try {
    const [recentIds, favoriteIds] = await Promise.all([
      listRecentFoodIds(user.id),
      listFavoriteFoodIds(user.id),
    ]);
    return Response.json({ recentIds, favoriteIds });
  } catch (error) {
    return errorResponse(error, "Could not load your recent foods.");
  }
}
