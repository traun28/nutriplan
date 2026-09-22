/**
 * Phase 6 — POST /api/assistant/actions { action }
 *
 * The only path by which an assistant suggestion becomes a database write.
 * The action arrives as a fixed structured shape; this route re-validates
 * every field, re-checks the food against the user's CURRENT restriction
 * settings, and then calls the same repository/engine functions the
 * regular UI uses (food log create, Phase 3 replaceWeeklyMeal, water add).
 * Nothing the AI produced is trusted or executed directly.
 */
import { badRequest, currentUser, errorResponse, notFound, readJson, unauthorized } from "@/services/server/guard";
import { isValidDateKey, validateServings, validateWaterAmount } from "@/services/foodLog/validation";
import { FOOD_LOG_MEAL_IDS, type FoodLogMealType } from "@/services/foodLog/types";
import { findFood, scaleFood } from "@/services/foodLog/calculations";
import { addWater, createFoodLog } from "@/services/server/foodLogRepository";
import { getMealPlan, updateMealPlan } from "@/services/server/mealPlanRepository";
import { assertPlanSafe } from "@/services/server/mealPlanService";
import { getProfile } from "@/services/server/repository";
import { parseDayIndex, parseSlot, replaceWeeklyMeal } from "@/services/diet/weeklyPlanner";
import { isFoodSafeFor } from "@/services/ai/tools";
import { checkRateLimit } from "@/services/server/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { action?: { type?: unknown } & Record<string, unknown> };

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const limit = checkRateLimit(`actions:${user.id}`, 30);
  if (!limit.ok) return Response.json({ error: "Too many actions in a short time — please wait a moment." }, { status: 429 });
  const body = await readJson<Body>(request);
  const action = body?.action;
  if (!action || typeof action !== "object" || typeof action.type !== "string") return badRequest("That action is not valid.");

  try {
    switch (action.type) {
      case "log_food": {
        const foodId = typeof action.foodId === "string" ? action.foodId : "";
        const servings = Number(action.servings);
        const mealType = action.mealType;
        const logDate = action.logDate;
        if (!isValidDateKey(logDate)) return badRequest("Choose a valid date.");
        if (!FOOD_LOG_MEAL_IDS.includes(mealType as FoodLogMealType)) return badRequest("Choose a valid meal.");
        const servingsError = validateServings(servings);
        if (servingsError) return badRequest(servingsError);
        const food = findFood(foodId);
        if (!food) return notFound("That food could not be found.");
        // Restriction check against the user's current profile (allergy protection is server-side).
        const profile = await getProfile(user.id);
        const safety = isFoodSafeFor(food.id, profile);
        const { entry } = await createFoodLog(user.id, {
          logDate,
          mealType: mealType as FoodLogMealType,
          loggedTime: null,
          nutrition: scaleFood(food, servings),
          clientId: typeof action.clientId === "string" ? action.clientId.slice(0, 80) : null,
        });
        return Response.json({ ok: true, message: `${food.name} was logged as ${String(mealType)}.${safety.ok ? "" : ` Note: ${safety.reason}`}`, entry });
      }
      case "replace_meal": {
        const planId = Number(action.planId);
        const dayIndex = parseDayIndex(action.dayIndex);
        const slot = parseSlot(action.slot);
        const foodId = typeof action.foodId === "string" ? action.foodId.trim() : "";
        if (!Number.isInteger(planId) || planId <= 0 || dayIndex === null || slot === null || !foodId) return badRequest("planId, dayIndex, slot and foodId are required.");
        const [plan, profile] = await Promise.all([getMealPlan(user.id, planId), getProfile(user.id)]);
        if (!plan) return notFound("Plan not found.");
        if (!profile) return Response.json({ error: "Profile not found." }, { status: 409 });
        const safety = isFoodSafeFor(foodId, profile);
        if (!safety.ok) return Response.json({ error: `That replacement was blocked by your restriction settings: ${safety.reason}` }, { status: 422 });
        const result = replaceWeeklyMeal(plan.data, profile, dayIndex, slot, foodId);
        if (!result.success) return Response.json({ error: result.message, code: result.reason }, { status: 422 });
        const safe = assertPlanSafe(result.data.data, profile);
        if (!safe.ok) return Response.json({ error: safe.message, details: safe.details }, { status: 422 });
        const updated = await updateMealPlan(user.id, planId, { data: result.data.data });
        if (!updated) return notFound("Plan not found.");
        return Response.json({ ok: true, message: `${result.data.previousName} was replaced with ${result.data.newName}.`, plan: updated });
      }
      case "add_water": {
        const amountMl = Number(action.amountMl);
        const logDate = action.logDate;
        if (!isValidDateKey(logDate)) return badRequest("Choose a valid date.");
        const err = validateWaterAmount(amountMl);
        if (err) return badRequest(err);
        const entry = await addWater(user.id, logDate, amountMl);
        return Response.json({ ok: true, message: `${amountMl} ml of water was logged.`, entry });
      }
      case "navigate":
        return badRequest("Navigation happens in the app, not on the server.");
      default:
        return badRequest("That action is not supported.");
    }
  } catch (error) {
    return errorResponse(error, "The action could not be completed.");
  }
}
