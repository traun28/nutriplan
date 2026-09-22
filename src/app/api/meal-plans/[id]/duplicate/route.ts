/** Phase 3 — POST /api/meal-plans/[id]/duplicate { name? } → copy of an owned plan. */
import { currentUser, errorResponse, notFound, readJson, unauthorized } from "@/services/server/guard";
import { cleanPlanName, createMealPlan, getMealPlan } from "@/services/server/mealPlanRepository";
import { parsePlanId } from "@/services/server/mealPlanHttp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const id = parsePlanId((await params).id);
  if (!id) return notFound("Plan not found.");
  const body = (await readJson<{ name?: unknown }>(request)) ?? {};
  try {
    const existing = await getMealPlan(user.id, id);
    if (!existing) return notFound("Plan not found.");
    const plan = await createMealPlan(user.id, {
      name: cleanPlanName(body.name, `${existing.name} (copy)`),
      startDate: existing.startDate,
      data: { ...existing.data, provenance: { ...existing.data.provenance } },
      makeCurrent: false,
    });
    return Response.json({ plan }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
