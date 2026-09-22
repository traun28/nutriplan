/**
 * Shared loader for the signed-in user's saved nutrition targets + diet plan.
 *
 * Two providers (NutritionContext and DietPlanContext) both need `/api/plan`
 * at start-up. They mount together, so without coordination the same request
 * is sent twice on every page load. This keeps a single in-flight promise and
 * hands the same response to every caller; it is dropped as soon as the
 * request settles so later reloads always hit the server again.
 */
import type { DietPlan, ProcessedProfile } from "@/types/profile";

export interface SavedPlanPayload {
  processed: ProcessedProfile | null;
  plan: DietPlan | null;
}

let inFlight: Promise<SavedPlanPayload> | null = null;

export function fetchSavedPlan(): Promise<SavedPlanPayload> {
  if (inFlight) return inFlight;
  inFlight = fetch("/api/plan")
    .then(async (response) => {
      if (!response.ok) throw new Error("Could not load the saved plan.");
      return (await response.json()) as SavedPlanPayload;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
