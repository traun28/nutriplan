/**
 * Phase 3 — server-side orchestration shared by the /api/meal-plans routes.
 *
 * Resolves the signed-in user's profile and nutrition targets from the
 * database (never from the request body), checks the profile is complete
 * enough to plan for, and validates every plan before it is persisted.
 */
import type { ProcessedProfile, UserProfile } from "@/types/profile";
import { isPersonalDetailsComplete, isNutritionComplete } from "@/lib/validation";
import { isProcessedProfileCurrent } from "@/lib/freshness";
import { processUserProfile } from "@/services/nutrition/nutritionProcessor";
import { getProcessed, getProfile } from "@/services/server/repository";
import {
  validateWeeklyPlanData,
  type WeeklyPlanData,
} from "@/services/diet/weeklyPlanner";

export const PROFILE_INCOMPLETE_MESSAGE =
  "Complete your nutrition profile before generating a personalized plan.";

export type PlanningContext =
  | { ok: true; profile: UserProfile; processed: ProcessedProfile }
  | { ok: false; status: number; code: "PROFILE_INCOMPLETE" | "TARGETS_UNAVAILABLE" | "DB_UNAVAILABLE"; message: string };

/**
 * Loads the planning inputs for a user. Targets are re-derived with the
 * existing nutrition engine when the stored ones are stale, so a weekly
 * plan is always built from the current profile revision.
 */
export async function loadPlanningContext(userId: number): Promise<PlanningContext> {
  const profile = await getProfile(userId);
  if (!profile) {
    return { ok: false, status: 409, code: "PROFILE_INCOMPLETE", message: PROFILE_INCOMPLETE_MESSAGE };
  }
  if (
    !isPersonalDetailsComplete(profile.personalDetails) ||
    !isNutritionComplete(profile.nutritionalInformation, profile.dietaryPreferences)
  ) {
    return { ok: false, status: 409, code: "PROFILE_INCOMPLETE", message: PROFILE_INCOMPLETE_MESSAGE };
  }

  let processed = await getProcessed(userId);
  if (!processed || !isProcessedProfileCurrent(processed, profile) || processed.status !== "complete") {
    const result = processUserProfile(profile);
    processed = result.success ? result.processed : null;
  }
  if (!processed || processed.status !== "complete" || processed.energy.selectedCalories === null) {
    return {
      ok: false,
      status: 409,
      code: "TARGETS_UNAVAILABLE",
      message: "Your nutrition targets could not be calculated. Review your profile and calculate your nutrition first.",
    };
  }
  return { ok: true, profile, processed };
}

/** Throws a 422-shaped error object when a plan fails the pre-save checks. */
export function assertPlanSafe(data: WeeklyPlanData, profile: UserProfile): { ok: true } | { ok: false; message: string; details: string[] } {
  const result = validateWeeklyPlanData(data, profile);
  if (result.isValid) return { ok: true };
  return {
    ok: false,
    message: "The plan did not pass the safety check, so it was not saved.",
    details: result.errors.slice(0, 5),
  };
}
