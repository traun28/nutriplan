/**
 * PUT /api/plan — persist the processed nutrition targets and the generated
 * diet plan for the signed-in user (Part 6/7/8 outputs).
 */
import { getPlan, getProcessed, savePlan, saveProcessed } from "@/services/server/repository";
import { currentUser, serverError, unauthorized, badRequest } from "@/services/server/guard";
import type { DietPlan, ProcessedProfile } from "@/types/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  processed?: ProcessedProfile | null;
  plan?: DietPlan | null;
}

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  try {
    const [processed, plan] = await Promise.all([
      getProcessed(user.id),
      getPlan(user.id),
    ]);
    return Response.json({ processed, plan });
  } catch {
    return serverError("Could not load your plan.");
  }
}

export async function PUT(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body) return badRequest("Invalid request.");

  try {
    if (body.processed) await saveProcessed(user.id, body.processed);
    if (body.plan) await savePlan(user.id, body.plan);
    return Response.json({ ok: true });
  } catch {
    return serverError("Could not save your plan.");
  }
}

export async function DELETE() {
  const user = await currentUser();
  if (!user) return unauthorized();
  try {
    // Clearing targets + plan without touching the profile itself.
    await saveProcessed(user.id, null as unknown as ProcessedProfile);
    await savePlan(user.id, null as unknown as DietPlan);
    return Response.json({ ok: true });
  } catch {
    return serverError("Could not clear your plan.");
  }
}
