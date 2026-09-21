"use client";

/**
 * Part 9 — convenience hook wrapping the application state machine.
 * Pages call this instead of re-deriving status from three contexts.
 */
import { useMemo } from "react";
import { useProfile } from "@/context/ProfileContext";
import { useNutrition } from "@/context/NutritionContext";
import { useDietPlan } from "@/context/DietPlanContext";
import { getAppStatus, type AppStatus } from "@/lib/appStatus";

export function useAppStatus(): AppStatus {
  const { profile, hasSavedProfile, hasUnsavedChanges, completion } = useProfile();
  const { processed } = useNutrition();
  const { plan } = useDietPlan();

  return useMemo(
    () =>
      getAppStatus({
        profile,
        processed,
        plan,
        hasSavedProfile,
        hasUnsavedChanges,
        hasAnyData: completion.hasAnyData,
      }),
    [profile, processed, plan, hasSavedProfile, hasUnsavedChanges, completion.hasAnyData],
  );
}
