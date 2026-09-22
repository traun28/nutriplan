/**
 * Phase 2 — water tracker.
 *
 * GET  /api/water?date=YYYY-MM-DD   entries + total + target for one day
 * POST /api/water                   { date, amountMl }
 */
import { badRequest, currentUser, errorResponse, readJson, unauthorized } from "@/services/server/guard";
import { addWater, getSettings, listWaterForDate } from "@/services/server/foodLogRepository";
import { isValidDateKey, validateWaterAmount } from "@/services/foodLog/validation";
import { DEFAULT_WATER_TARGET_ML } from "@/services/foodLog/water";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const date = new URL(request.url).searchParams.get("date");
  if (!isValidDateKey(date)) return badRequest("Choose a valid date.");
  try {
    const [entries, settings] = await Promise.all([listWaterForDate(user.id, date), getSettings(user.id)]);
    const totalMl = entries.reduce((sum, entry) => sum + entry.amountMl, 0);
    return Response.json({
      date,
      entries,
      totalMl,
      targetMl: settings.waterTargetMl ?? DEFAULT_WATER_TARGET_ML,
    });
  } catch (error) {
    return errorResponse(error, "Could not load your water log.");
  }
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const body = await readJson<{ date?: unknown; amountMl?: unknown }>(request);
  if (!body) return badRequest("Invalid request.");
  if (!isValidDateKey(body.date)) return badRequest("Choose a valid date.");
  const amountError = validateWaterAmount(body.amountMl);
  if (amountError) return badRequest(amountError);
  try {
    const entry = await addWater(user.id, body.date, body.amountMl as number);
    return Response.json({ entry }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Could not save the water entry.");
  }
}
