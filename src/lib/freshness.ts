/**
 * Freshness checks shared by the state machine and the contexts.
 *
 * These are tiny, pure comparisons. They live here — with no imports from
 * the processing or generation engines — so the root layout and the
 * homepage never pull the food database or the nutrition engine into
 * their JavaScript bundle just to answer "is this plan still current?".
 */
import type { DietPlan, ProcessedProfile, UserProfile } from "@/types/profile";

/** A processed result is current only if derived from this exact revision. */
export function isProcessedProfileCurrent(
  processed: ProcessedProfile | null,
  profile: UserProfile,
): boolean {
  if (!processed) return false;
  if (!profile.profileId) return false;
  return (
    processed.sourceProfileId === profile.profileId &&
    processed.sourceProfileUpdatedAt === profile.updatedAt
  );
}

/** A plan is current only if generated from this exact profile revision. */
export function isDietPlanCurrent(
  plan: DietPlan | null,
  profile: UserProfile,
): boolean {
  if (!plan) return false;
  if (!profile.profileId) return false;
  return (
    plan.sourceProfileId === profile.profileId &&
    plan.sourceProfileUpdatedAt === profile.updatedAt
  );
}
