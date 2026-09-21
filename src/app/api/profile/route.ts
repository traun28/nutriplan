/**
 * GET /api/profile — load the signed-in user's profile, processed targets
 * and generated plan in one request, so the UI never needs three round-trips.
 * PUT /api/profile — save profile (+ optional processed/plan).
 * DELETE /api/profile — clear all of the user's planner data.
 */
import {
  deleteProfile,
  getPlan,
  getProcessed,
  getProfile,
  savePlan,
  saveProcessed,
  saveProfile,
} from "@/services/server/repository";
import { currentUser, serverError, unauthorized, badRequest } from "@/services/server/guard";
import { rehydrateProfile, normalizeProfileForStorage } from "@/lib/profileNormalize";
import type { DietPlan, ProcessedProfile } from "@/types/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  try {
    const [profile, processed, plan] = await Promise.all([
      getProfile(user.id),
      getProcessed(user.id),
      getPlan(user.id),
    ]);
    return Response.json({ profile, processed, plan });
  } catch {
    return serverError("Could not load your saved profile.");
  }
}

interface PutBody {
  profile?: unknown;
  processed?: ProcessedProfile | null;
  plan?: DietPlan | null;
}

export async function PUT(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const body = (await request.json().catch(() => null)) as PutBody | null;
  if (!body) return badRequest("Invalid request.");

  try {
    if (body.profile !== undefined) {
      // Re-hydrate through the canonical default shape, then normalise, so a
      // partial or older payload can never produce a broken profile.
      const cleaned = normalizeProfileForStorage(rehydrateProfile(body.profile));
      const okProfile = await saveProfile(user.id, cleaned);
      if (!okProfile) return serverError("Could not save your profile.");
    }
    if (body.processed !== undefined) {
      if (body.processed === null) {
        // clearing is handled by DELETE; ignore null here
      } else {
        await saveProcessed(user.id, body.processed);
      }
    }
    if (body.plan !== undefined) {
      if (body.plan !== null) await savePlan(user.id, body.plan);
    }
    return Response.json({ ok: true });
  } catch {
    return serverError("Could not save your profile.");
  }
}

export async function DELETE() {
  const user = await currentUser();
  if (!user) return unauthorized();
  const okDeleted = await deleteProfile(user.id);
  if (!okDeleted) return serverError("Your profile could not be deleted.");
  return Response.json({ ok: true });
}
