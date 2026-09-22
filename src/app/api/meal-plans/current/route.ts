/** Phase 3 — GET /api/meal-plans/current: the plan the dashboard reads from. */
import { currentUser, errorResponse, unauthorized } from "@/services/server/guard";
import { getCurrentMealPlan } from "@/services/server/mealPlanRepository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  try {
    return Response.json({ plan: await getCurrentMealPlan(user.id) });
  } catch (error) {
    return errorResponse(error);
  }
}
