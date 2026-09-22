/**
 * Phase 3 — GET /api/meal-plans lists the signed-in user's saved weekly
 * plans; POST generates a new 7-day plan from the stored profile and
 * targets, validates it and saves it as the current plan.
 */
import { currentUser, errorResponse, readJson, unauthorized } from "@/services/server/guard";
import { assertPlanSafe, loadPlanningContext } from "@/services/server/mealPlanService";
import { cleanPlanName, createMealPlan, listMealPlans } from "@/services/server/mealPlanRepository";
import { generateWeeklyPlan } from "@/services/diet/weeklyPlanner";
import { parseBudget } from "@/services/server/mealPlanHttp";
import { isValidDateKey } from "@/services/foodLog/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  try {
    return Response.json({ plans: await listMealPlans(user.id) });
  } catch (error) {
    return errorResponse(error);
  }
}

interface CreateBody {
  name?: unknown;
  startDate?: unknown;
  budget?: unknown;
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const body = (await readJson<CreateBody>(request)) ?? {};

  const startDate = body.startDate === null || body.startDate === undefined || body.startDate === ""
    ? null
    : isValidDateKey(body.startDate)
      ? body.startDate
      : undefined;
  if (startDate === undefined) {
    return Response.json({ error: "Start date must be a valid YYYY-MM-DD date." }, { status: 400 });
  }

  try {
    const context = await loadPlanningContext(user.id);
    if (!context.ok) {
      return Response.json({ error: context.message, code: context.code }, { status: context.status });
    }
    const generated = generateWeeklyPlan(context.profile, context.processed, {
      budget: parseBudget(body.budget),
      startDate,
    });
    if (!generated.success) {
      return Response.json(
        { error: generated.message, code: generated.reason, details: generated.details },
        { status: 422 },
      );
    }
    const safe = assertPlanSafe(generated.data, context.profile);
    if (!safe.ok) {
      return Response.json({ error: safe.message, details: safe.details, code: "VALIDATION_FAILED" }, { status: 422 });
    }
    const plan = await createMealPlan(user.id, {
      name: cleanPlanName(body.name),
      startDate,
      data: generated.data,
      makeCurrent: true,
    });
    return Response.json({ plan }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "The plan could not be generated right now.");
  }
}
