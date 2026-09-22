"use client";

/**
 * Part 6 — processed nutrition state.
 *
 * Sits on top of `ProfileProvider` and exposes the derived nutritional
 * profile. Part 7 will consume `getProcessedNutritionProfile()` (exposed
 * here as `processed`) together with the source profile, and must NOT
 * recalculate BMI, BMR or calorie targets itself.
 *
 * Results are cached in a SEPARATE storage key so the user's own answers
 * are never overwritten by derived data, and are marked stale whenever
 * the source profile revision changes.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  ProcessedProfile,
  ProcessingIssue,
  UserProfile,
} from "@/types/profile";
import { useProfile } from "@/context/ProfileContext";
import { useAuth } from "@/context/AuthContext";
import { fetchSavedPlan } from "@/services/planSync";
import { isProcessedProfileCurrent } from "@/lib/freshness";

/** Loaded on demand so the landing page does not bundle the engine. */
const loadProcessor = () => import("@/services/nutrition/nutritionProcessor");
import {
  deleteProcessedProfile,
  getProcessedProfile,
  saveProcessedProfile,
} from "@/services/profileStorage";

export type ProcessingStatus = "idle" | "processing" | "success" | "error";

interface NutritionContextValue {
  /** The latest processed result, or null when nothing has been run. */
  processed: ProcessedProfile | null;
  status: ProcessingStatus;
  errors: ProcessingIssue[];
  /** True when the source profile changed after the last calculation. */
  isStale: boolean;
  /**
   * Runs the engine against the current profile and caches the result.
   * An explicit profile can be passed straight after a save, because the
   * React state for the new revision is not applied synchronously.
   */
  recalculate: (sourceProfile?: UserProfile) => Promise<ProcessedProfile | null>;
  /** Clears cached results (used when the profile is deleted/restarted). */
  clearResults: () => void;
}

const NutritionContext = createContext<NutritionContextValue | null>(null);

export function NutritionProvider({ children }: { children: ReactNode }) {
  const { profile, hydrated } = useProfile();
  const { user } = useAuth();
  const [processed, setProcessed] = useState<ProcessedProfile | null>(null);
  const [status, setStatus] = useState<ProcessingStatus>("idle");
  const [errors, setErrors] = useState<ProcessingIssue[]>([]);

  /**
   * Load any cached result once the profile itself has been hydrated.
   * Reading browser storage is a genuine "subscribe to an external system"
   * case, which can only happen after mount (the server has no storage),
   * so a state update inside this effect is intentional here.
   */
  useEffect(() => {
    if (!hydrated) return;
    const result = getProcessedProfile();
    if (result.status === "ok") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProcessed(result.data);
      setStatus("success");
    } else if (result.status === "corrupt") {
      deleteProcessedProfile();
    }
  }, [hydrated]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void fetchSavedPlan()
      .then((data) => {
        if (cancelled || !data.processed) return;
        setProcessed(data.processed);
        setStatus("success");
        saveProcessedProfile(data.processed);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user]);

  const recalculate = useCallback(
    async (sourceProfile?: UserProfile): Promise<ProcessedProfile | null> => {
      setStatus("processing");
      const source = sourceProfile ?? profile;
      try {
        const { processUserProfile } = await loadProcessor();
        const result = processUserProfile(source);
        setProcessed(result.processed);
        setErrors(result.errors);
        setStatus(result.success ? "success" : "error");
        // Only a complete result is worth caching between sessions.
        if (result.success) {
          saveProcessedProfile(result.processed);
          void fetch("/api/plan", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ processed: result.processed }),
          }).catch(() => undefined);
          return result.processed;
        }
        deleteProcessedProfile();
        return null;
      } catch {
        setErrors([
          {
            field: "system",
            message: "The nutrition engine could not be loaded. Please try again.",
          },
        ]);
        setStatus("error");
        return null;
      }
    },
    [profile],
  );

  const clearResults = useCallback(() => {
    deleteProcessedProfile();
    setProcessed(null);
    setStatus("idle");
    setErrors([]);
  }, []);

  const value = useMemo<NutritionContextValue>(() => {
    const isStale =
      processed !== null && !isProcessedProfileCurrent(processed, profile);
    return { processed, status, errors, isStale, recalculate, clearResults };
  }, [processed, status, errors, profile, recalculate, clearResults]);

  return (
    <NutritionContext.Provider value={value}>
      {children}
    </NutritionContext.Provider>
  );
}

export function useNutrition(): NutritionContextValue {
  const context = useContext(NutritionContext);
  if (!context) {
    throw new Error("useNutrition must be used within a NutritionProvider");
  }
  return context;
}
