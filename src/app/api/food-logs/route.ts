/**
 * Phase 2 — food log collection.
 *
 * GET  /api/food-logs?date=YYYY-MM-DD        entries + totals for one day
 * GET  /api/food-logs?page=1&pageSize=20     paginated history (newest first)
 * POST /api/food-logs                        create one entry
 *
 * The user id always comes from the session cookie; nutrition values are
 * derived server-side from the food dataset, never trusted from the client.
 */
import { badRequest, currentUser, errorResponse, readJson, unauthorized } from "@/services/server/guard";
import { createFoodLog, listFoodHistory, listFoodLogsForDate } from "@/services/server/foodLogRepository";
import { findFood, scaleFood, sumEntries } from "@/services/foodLog/calculations";
import { firstError, hasErrors, isValidDateKey, validateCreate } from "@/services/foodLog/validation";
import type { FoodLogCreateInput } from "@/services/foodLog/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PAGE_SIZE = 50;

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const url = new URL(request.url);
  const date = url.searchParams.get("date");

  try {
    if (date !== null) {
      if (!isValidDateKey(date)) return badRequest("Choose a valid date.");
      const entries = await listFoodLogsForDate(user.id, date);
      return Response.json({ date, entries, totals: sumEntries(entries) });
    }

    const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(url.searchParams.get("pageSize") ?? "20") || 20));
    const { entries, total } = await listFoodHistory(user.id, page, pageSize);
    return Response.json({ entries, total, page, pageSize });
  } catch (error) {
    return errorResponse(error, "Could not load your food log.");
  }
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const body = await readJson<Partial<FoodLogCreateInput>>(request);
  if (!body) return badRequest("Invalid request.");

  const errors = validateCreate(body);
  if (hasErrors(errors)) {
    return Response.json({ error: firstError(errors), fields: errors }, { status: 400 });
  }

  const food = findFood(body.foodId as string);
  if (!food) return Response.json({ error: "That food could not be found." }, { status: 404 });

  const clientId =
    typeof body.clientId === "string" && body.clientId.length > 0 && body.clientId.length <= 80
      ? body.clientId
      : null;

  try {
    const { entry, created } = await createFoodLog(user.id, {
      logDate: body.logDate as string,
      mealType: body.mealType as FoodLogCreateInput["mealType"],
      loggedTime: body.loggedTime ? body.loggedTime : null,
      nutrition: scaleFood(food, body.servings as number),
      clientId,
    });
    return Response.json({ entry }, { status: created ? 201 : 200 });
  } catch (error) {
    return errorResponse(error, "Could not save the food entry.");
  }
}
