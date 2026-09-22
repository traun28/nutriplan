/** Phase 3 — POST /api/meal-plans/[id]/replace { dayIndex, slot, foodId } */
import { currentUser, errorResponse, notFound, readJson, unauthorized } from "@/services/server/guard";
import { getMealPlan, updateMealPlan } from "@/services/server/mealPlanRepository";
import { assertPlanSafe } from "@/services/server/mealPlanService";
import { getProfile } from "@/services/server/repository";
import { parsePlanId } from "@/services/server/mealPlanHttp";
import { parseDayIndex, parseSlot, replaceWeeklyMeal } from "@/services/diet/weeklyPlanner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const id = parsePlanId((await params).id);
  if (!id) return notFound("Plan not found.");
  const body = await readJson<{ dayIndex?: unknown; slot?: unknown; foodId?: unknown }>(request);
  const dayIndex = parseDayIndex(body?.dayIndex);
  const slot = parseSlot(body?.slot);
  const foodId = typeof body?.foodId === "string" ? body.foodId.trim() : "";
  if (dayIndex === null || slot === null || !foodId) {
    return Response.json({ error: "dayIndex, slot and foodId are required." }, { status: 400 });
  }
  try {
    const [existing, profile] = await Promise.all([getMealPlan(user.id, id), getProfile(user.id)]);
    if (!existing) return notFound("Plan not found.");
    if (!profile) return Response.json({ error: "Profile not found." }, { status: 409 });

    const result = replaceWeeklyMeal(existing.data, profile, dayIndex, slot, foodId);
    if (!result.success) return Response.json({ error: result.message, code: result.reason }, { status: 422 });
    const safe = assertPlanSafe(result.data.data, profile);
    if (!safe.ok) return Response.json({ error: safe.message, details: safe.details, code: "VALIDATION_FAILED" }, { status: 422 });

    const plan = await updateMealPlan(user.id, id, { data: result.data.data });
    if (!plan) return notFound("Plan not found.");
    return Response.json({
      plan,
      message: `${result.data.previousName} was replaced with ${result.data.newName}.`,
    });
  } catch (error) {
    return errorResponse(error, "The meal could not be replaced right now.");
  }
}
