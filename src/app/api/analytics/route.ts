/**
 * Phase 5 — GET /api/analytics?view=day|week&date=YYYY-MM-DD
 * Daily nutrition analysis (gaps, contributions, suggestions, score,
 * planned-vs-actual, today-vs-yesterday, insights) or the weekly view
 * (day points, averages, week-vs-week, weight points, insights).
 */
import { badRequest, currentUser, errorResponse, unauthorized } from "@/services/server/guard";
import { isValidDateKey } from "@/services/foodLog/validation";
import { buildDailyAnalytics, buildWeeklyAnalytics } from "@/services/server/analyticsService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const params = new URL(request.url).searchParams;
  const view = params.get("view") ?? "day";
  const date = params.get("date");
  const today = params.get("today");
  const hour = Number(params.get("hour") ?? "12");
  if (!isValidDateKey(date)) return badRequest("Choose a valid date.");
  if (view !== "day" && view !== "week") return badRequest("View must be day or week.");
  try {
    if (view === "day") {
      return Response.json(await buildDailyAnalytics(user.id, date, isValidDateKey(today) ? today : date, Number.isFinite(hour) ? hour : 12));
    }
    return Response.json(await buildWeeklyAnalytics(user.id, date));
  } catch (error) {
    return errorResponse(error, "The analysis could not be prepared right now.");
  }
}
