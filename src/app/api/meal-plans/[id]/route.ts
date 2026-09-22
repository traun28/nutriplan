/**
 * Phase 3 — one saved weekly plan.
 *   GET    → full plan (owner only)
 *   PATCH  → rename / set start date / mark as current
 *   DELETE → remove (owner only)
 */
import { currentUser, errorResponse, notFound, readJson, unauthorized } from "@/services/server/guard";
import {
  cleanPlanName,
  deleteMealPlan,
  getMealPlan,
  updateMealPlan,
} from "@/services/server/mealPlanRepository";
import { relabelDays, summarise } from "@/services/diet/weeklyPlanner";
import { isValidDateKey } from "@/services/foodLog/validation";
import { parsePlanId } from "@/services/server/mealPlanHttp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const id = parsePlanId((await params).id);
  if (!id) return notFound("Plan not found.");
  try {
    const plan = await getMealPlan(user.id, id);
    return plan ? Response.json({ plan }) : notFound("Plan not found.");
  } catch (error) {
    return errorResponse(error);
  }
}

interface PatchBody {
  name?: unknown;
  startDate?: unknown;
  isCurrent?: unknown;
}

export async function PATCH(request: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const id = parsePlanId((await params).id);
  if (!id) return notFound("Plan not found.");
  const body = await readJson<PatchBody>(request);
  if (!body) return Response.json({ error: "Invalid request." }, { status: 400 });

  const patch: { name?: string; startDate?: string | null; isCurrent?: boolean; data?: never } = {};
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      return Response.json({ error: "Plan name cannot be empty." }, { status: 400 });
    }
    patch.name = cleanPlanName(body.name);
  }
  if (body.startDate !== undefined) {
    if (body.startDate === null || body.startDate === "") patch.startDate = null;
    else if (isValidDateKey(body.startDate)) patch.startDate = body.startDate;
    else return Response.json({ error: "Start date must be a valid YYYY-MM-DD date." }, { status: 400 });
  }
  if (body.isCurrent !== undefined) {
    if (typeof body.isCurrent !== "boolean") return Response.json({ error: "Invalid request." }, { status: 400 });
    patch.isCurrent = body.isCurrent;
  }

  try {
    const existing = await getMealPlan(user.id, id);
    if (!existing) return notFound("Plan not found.");
    const data =
      patch.startDate !== undefined
        ? (() => {
            const days = relabelDays(existing.data.days, patch.startDate ?? null);
            return { ...existing.data, days, summary: summarise(days, existing.data.targets) };
          })()
        : undefined;
    const plan = await updateMealPlan(user.id, id, { ...patch, data });
    return plan ? Response.json({ plan }) : notFound("Plan not found.");
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const id = parsePlanId((await params).id);
  if (!id) return notFound("Plan not found.");
  try {
    const removed = await deleteMealPlan(user.id, id);
    return removed ? Response.json({ ok: true }) : notFound("Plan not found.");
  } catch (error) {
    return errorResponse(error);
  }
}
