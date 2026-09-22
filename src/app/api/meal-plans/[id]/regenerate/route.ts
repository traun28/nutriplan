/**
 * Phase 3 — POST /api/meal-plans/[id]/regenerate
 * Body: {} → whole plan · { dayIndex } → one day · { dayIndex, slot } → one meal.
 * Regenerating the whole plan replaces this plan's meals in place (the
 * user chose "Regenerate"); other saved plans are never touched.
 */
import { currentUser, errorResponse, notFound, readJson, unauthorized } from "@/services/server/guard";
import { getMealPlan, updateMealPlan } from "@/services/server/mealPlanRepository";
import { assertPlanSafe, loadPlanningContext, pantryIngredientsFor } from "@/services/server/mealPlanService";
import { parsePlanId } from "@/services/server/mealPlanHttp";
import {
  generateWeeklyPlan,
  parseDayIndex,
  parseSlot,
  regenerateWeeklyDay,
  regenerateWeeklyMeal,
} from "@/services/diet/weeklyPlanner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const id = parsePlanId((await params).id);
  if (!id) return notFound("Plan not found.");
  const body = (await readJson<{ dayIndex?: unknown; slot?: unknown }>(request)) ?? {};

  const dayIndex = body.dayIndex === undefined ? null : parseDayIndex(body.dayIndex);
  if (body.dayIndex !== undefined && dayIndex === null) {
    return Response.json({ error: "dayIndex must be between 0 and 6." }, { status: 400 });
  }
  const slot = body.slot === undefined ? null : parseSlot(body.slot);
  if (body.slot !== undefined && slot === null) {
    return Response.json({ error: "Unknown meal slot." }, { status: 400 });
  }
  if (slot && dayIndex === null) {
    return Response.json({ error: "A meal can only be regenerated for a specific day." }, { status: 400 });
  }

  try {
    const existing = await getMealPlan(user.id, id);
    if (!existing) return notFound("Plan not found.");
    const context = await loadPlanningContext(user.id);
    if (!context.ok) return Response.json({ error: context.message, code: context.code }, { status: context.status });

    const preferPantry = existing.data.options.preferPantry === true;
    const pantryNames = await pantryIngredientsFor(user.id, preferPantry);
    let next;
    let message: string;
    if (dayIndex === null) {
      const result = generateWeeklyPlan(context.profile, context.processed, {
        budget: existing.data.options.budget,
        startDate: existing.startDate,
        preferPantry,
        preferIngredients: pantryNames,
      });
      if (!result.success) return Response.json({ error: result.message, code: result.reason, details: result.details }, { status: 422 });
      next = result.data;
      message = "A fresh 7-day plan was generated.";
    } else if (slot === null) {
      const result = regenerateWeeklyDay(existing.data, context.profile, context.processed, dayIndex, pantryNames);
      if (!result.success) return Response.json({ error: result.message, code: result.reason }, { status: 422 });
      next = result.data;
      message = `Day ${dayIndex + 1} was regenerated.`;
    } else {
      const result = regenerateWeeklyMeal(existing.data, context.profile, dayIndex, slot, pantryNames);
      if (!result.success) return Response.json({ error: result.message, code: result.reason }, { status: 422 });
      next = result.data.data;
      message = `${result.data.previousName} was replaced with ${result.data.newName}.`;
    }

    const safe = assertPlanSafe(next, context.profile);
    if (!safe.ok) return Response.json({ error: safe.message, details: safe.details, code: "VALIDATION_FAILED" }, { status: 422 });
    const plan = await updateMealPlan(user.id, id, { data: next });
    if (!plan) return notFound("Plan not found.");
    return Response.json({ plan, message });
  } catch (error) {
    return errorResponse(error, "The plan could not be regenerated right now.");
  }
}
