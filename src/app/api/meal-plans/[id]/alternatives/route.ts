/** Phase 3 — GET /api/meal-plans/[id]/alternatives?dayIndex=&slot= */
import { currentUser, errorResponse, notFound, unauthorized } from "@/services/server/guard";
import { getMealPlan } from "@/services/server/mealPlanRepository";
import { getProfile } from "@/services/server/repository";
import { parsePlanId } from "@/services/server/mealPlanHttp";
import { alternativesFor, parseDayIndex, parseSlot } from "@/services/diet/weeklyPlanner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const id = parsePlanId((await params).id);
  if (!id) return notFound("Plan not found.");
  const url = new URL(request.url);
  const dayIndex = parseDayIndex(url.searchParams.get("dayIndex"));
  const slot = parseSlot(url.searchParams.get("slot"));
  if (dayIndex === null || slot === null) {
    return Response.json({ error: "dayIndex (0–6) and slot are required." }, { status: 400 });
  }
  try {
    const [plan, profile] = await Promise.all([getMealPlan(user.id, id), getProfile(user.id)]);
    if (!plan) return notFound("Plan not found.");
    if (!profile) return Response.json({ error: "Profile not found." }, { status: 409 });
    return Response.json({ alternatives: alternativesFor(plan.data, profile, dayIndex, slot, 6) });
  } catch (error) {
    return errorResponse(error);
  }
}
