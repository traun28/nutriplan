/**
 * GET /api/day?date=YYYY-MM-DD — everything the dashboard needs for one
 * day in a single request: food entries + totals, water entries + total +
 * target, favourites and recent foods.
 */
import { badRequest, currentUser, errorResponse, unauthorized } from "@/services/server/guard";
import {
  getSettings,
  listFavoriteFoodIds,
  listFoodLogsForDate,
  listRecentFoodIds,
  listWaterForDate,
} from "@/services/server/foodLogRepository";
import { sumEntries } from "@/services/foodLog/calculations";
import { isValidDateKey } from "@/services/foodLog/validation";
import { DEFAULT_WATER_TARGET_ML } from "@/services/foodLog/water";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const date = new URL(request.url).searchParams.get("date");
  if (!isValidDateKey(date)) return badRequest("Choose a valid date.");
  try {
    const [entries, water, settings, favoriteIds, recentIds] = await Promise.all([
      listFoodLogsForDate(user.id, date),
      listWaterForDate(user.id, date),
      getSettings(user.id),
      listFavoriteFoodIds(user.id),
      listRecentFoodIds(user.id),
    ]);
    return Response.json({
      date,
      entries,
      totals: sumEntries(entries),
      water: {
        entries: water,
        totalMl: water.reduce((sum, entry) => sum + entry.amountMl, 0),
        targetMl: settings.waterTargetMl ?? DEFAULT_WATER_TARGET_ML,
      },
      favoriteIds,
      recentIds,
    });
  } catch (error) {
    return errorResponse(error, "Could not load your day.");
  }
}
