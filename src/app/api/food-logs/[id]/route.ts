/**
 * Phase 2 — one food log entry.
 *
 * GET    /api/food-logs/:id
 * PATCH  /api/food-logs/:id   change food / quantity / meal / date / time
 * DELETE /api/food-logs/:id
 *
 * All operations are scoped to the signed-in user; an entry owned by
 * someone else is indistinguishable from a missing one (404).
 */
import { badRequest, currentUser, errorResponse, notFound, readJson, unauthorized } from "@/services/server/guard";
import { deleteFoodLog, getFoodLog, updateFoodLog } from "@/services/server/foodLogRepository";
import { findFood, scaleFood } from "@/services/foodLog/calculations";
import { firstError, hasErrors, validateUpdate } from "@/services/foodLog/validation";
import type { FoodLogUpdateInput } from "@/services/foodLog/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, context: Context) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const id = parseId((await context.params).id);
  if (!id) return notFound("That food entry could not be found.");
  try {
    const entry = await getFoodLog(user.id, id);
    if (!entry) return notFound("That food entry could not be found.");
    return Response.json({ entry });
  } catch (error) {
    return errorResponse(error, "Could not load the food entry.");
  }
}

export async function PATCH(request: Request, context: Context) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const id = parseId((await context.params).id);
  if (!id) return notFound("That food entry could not be found.");

  const body = await readJson<FoodLogUpdateInput>(request);
  if (!body) return badRequest("Invalid request.");
  const errors = validateUpdate(body);
  if (hasErrors(errors)) {
    return Response.json({ error: firstError(errors), fields: errors }, { status: 400 });
  }

  try {
    const existing = await getFoodLog(user.id, id);
    if (!existing) return notFound("That food entry could not be found.");

    const foodId = body.foodId ?? existing.foodId;
    const food = findFood(foodId);
    if (!food) return notFound("That food could not be found.");

    const servings = body.servings ?? existing.servings;
    const entry = await updateFoodLog(user.id, id, {
      logDate: body.logDate ?? existing.logDate,
      mealType: body.mealType ?? existing.mealType,
      loggedTime:
        body.loggedTime === undefined ? existing.loggedTime : body.loggedTime ? body.loggedTime : null,
      nutrition: scaleFood(food, servings),
    });
    if (!entry) return notFound("That food entry could not be found.");
    return Response.json({ entry });
  } catch (error) {
    return errorResponse(error, "Could not update the food entry.");
  }
}

export async function DELETE(_request: Request, context: Context) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const id = parseId((await context.params).id);
  if (!id) return notFound("That food entry could not be found.");
  try {
    const deleted = await deleteFoodLog(user.id, id);
    if (!deleted) return notFound("That food entry could not be found.");
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Could not delete the food entry.");
  }
}
