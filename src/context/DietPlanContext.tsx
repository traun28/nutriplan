"use client";

/**
 * Part 7/8 — generated diet-plan state.
 *
 * Sits on top of ProfileProvider and NutritionProvider. It owns the
 * current plan, the generation status, and the stale-plan flag.
 *
 * The UI (Part 8) only reads from here — it never calls the generator
 * directly and never recalculates nutrition.
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
import type { GenerationFailureReason } from "@/types/profile";
import { useProfile } from "@/context/ProfileContext";
import { useAuth } from "@/context/AuthContext";
import { useNutrition } from "@/context/NutritionContext";
import type {
  DietPlan,
  GenerationResult,
  MealId,
  ProcessedProfile,
  UserProfile,
} from "@/types/profile";
import { isDietPlanCurrent } from "@/lib/freshness";

/**
 * The generation engine (food database, filters, scoring, validator,
 * dataset signal) is loaded on first use, not at page load, so the
 * homepage and questionnaire ship a much smaller JavaScript bundle.
 */
const loadGenerator = () => import("@/services/diet/dietGenerator");
import {
  deleteDietPlan,
  getDietPlan,
  saveDietPlan,
} from "@/services/profileStorage";

export type PlanStatus = "idle" | "generating" | "ready" | "error";

export interface PlanFailure {
  reason: GenerationFailureReason;
  message: string;
  details: string[];
}

interface DietPlanContextValue {
  plan: DietPlan | null;
  status: PlanStatus;
  failure: PlanFailure | null;
  /** True when the profile changed after this plan was generated. */
  isStale: boolean;
  /** Set briefly after a successful regeneration, for subtle feedback. */
  justRegenerated: boolean;
  /**
   * Explicit inputs can be passed straight after a save/recalculate,
   * because React state for the new revision is not applied synchronously.
   */
  generate: (override?: { profile: UserProfile; processed: ProcessedProfile }) => void;
  regenerate: () => void;
  clearPlan: () => void;
  /**
   * Replace one meal slot with a safe alternative. Resolves with the
   * outcome so callers (UI, AI) can report truthfully; the plan is only
   * changed when the swapped plan passes the independent safety check.
   */
  replaceMeal: (
    slot: MealId,
    replacementFoodId: string,
  ) => Promise<{ success: true; message: string } | { success: false; message: string }>;
  /** Safe alternatives for a slot, for the Replace picker. */
  getAlternatives: (slot: MealId) => Promise<import("@/types/profile").FoodItemRecord[]>;
}

const DietPlanContext = createContext<DietPlanContextValue | null>(null);

export function DietPlanProvider({ children }: { children: ReactNode }) {
  const { profile, hydrated } = useProfile();
  const { processed } = useNutrition();
  const { user } = useAuth();

  const [plan, setPlan] = useState<DietPlan | null>(null);
  const [status, setStatus] = useState<PlanStatus>("idle");
  const [failure, setFailure] = useState<PlanFailure | null>(null);
  const [justRegenerated, setJustRegenerated] = useState(false);

  /**
   * Restore any cached plan once the profile has been hydrated. Reading
   * browser storage can only happen on the client, so the state update
   * inside this effect is intentional.
   */
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const result = getDietPlan();
      if (result.status === "ok") {
        setPlan(result.data);
        setStatus("ready");
      } else if (result.status === "corrupt") {
        deleteDietPlan();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [hydrated]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void fetch("/api/plan")
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load saved plan.");
        return (await response.json()) as { plan: DietPlan | null };
      })
      .then((data) => {
        if (cancelled || !data.plan) return;
        setPlan(data.plan);
        setStatus("ready");
        saveDietPlan(data.plan);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user]);

  const applyResult = useCallback(
    (result: GenerationResult, regenerated: boolean) => {
      if (result.success) {
        setPlan(result.plan);
        setFailure(null);
        setStatus("ready");
        saveDietPlan(result.plan);
        void fetch("/api/plan", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan: result.plan }),
        }).catch(() => undefined);
        if (regenerated) {
          setJustRegenerated(true);
          setTimeout(() => setJustRegenerated(false), 4000);
        }
      } else {
        setFailure({
          reason: result.reason,
          message: result.message,
          details: result.details,
        });
        setStatus("error");
      }
    },
    [],
  );

  const generate = useCallback((override?: { profile: UserProfile; processed: ProcessedProfile }) => {
    setStatus("generating");
    setFailure(null);
    const sourceProfile = override?.profile ?? profile;
    const sourceProcessed = override?.processed ?? processed;
    loadGenerator()
      .then(({ generateDietPlan }) =>
        applyResult(generateDietPlan(sourceProfile, sourceProcessed), false),
      )
      .catch(() => {
        setFailure({
          reason: "VALIDATION_FAILED",
          message: "The diet generator could not be loaded. Please try again.",
          details: [],
        });
        setStatus("error");
      });
  }, [profile, processed, applyResult]);

  const regenerate = useCallback(() => {
    setStatus("generating");
    setFailure(null);
    loadGenerator()
      .then(({ regenerateDietPlan }) =>
        applyResult(regenerateDietPlan(profile, processed, plan), true),
      )
      .catch(() => {
        setFailure({
          reason: "VALIDATION_FAILED",
          message: "The diet generator could not be loaded. Please try again.",
          details: [],
        });
        setStatus("error");
      });
  }, [profile, processed, plan, applyResult]);

  const replaceMeal = useCallback(
    async (slot: MealId, replacementFoodId: string) => {
      if (!plan) return { success: false as const, message: "There is no plan to change." };
      try {
        const { replaceMealInPlan } = await import("@/services/diet/replaceMeal");
        const result = replaceMealInPlan(plan, profile, slot, replacementFoodId);
        if (!result.success) return { success: false as const, message: result.message };
        setPlan(result.plan);
        saveDietPlan(result.plan);
        void fetch("/api/plan", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan: result.plan }),
        }).catch(() => undefined);
        setJustRegenerated(true);
        setTimeout(() => setJustRegenerated(false), 4000);
        return {
          success: true as const,
          message: `${result.previousName} was replaced with ${result.replacedWith.name}.`,
        };
      } catch {
        return { success: false as const, message: "The replacement could not be applied." };
      }
    },
    [plan, profile],
  );

  const getAlternatives = useCallback(
    async (slot: MealId) => {
      if (!plan) return [];
      const { listSafeAlternatives } = await import("@/services/diet/replaceMeal");
      return listSafeAlternatives(plan, profile, slot);
    },
    [plan, profile],
  );

  const clearPlan = useCallback(() => {
    deleteDietPlan();
    setPlan(null);
    setFailure(null);
    setStatus("idle");
  }, []);

  const value = useMemo<DietPlanContextValue>(() => {
    const isStale = plan !== null && !isDietPlanCurrent(plan, profile);
    return {
      plan,
      status,
      failure,
      isStale,
      justRegenerated,
      generate,
      regenerate,
      clearPlan,
      replaceMeal,
      getAlternatives,
    };
  }, [plan, status, failure, profile, justRegenerated, generate, regenerate, clearPlan, replaceMeal, getAlternatives]);

  return (
    <DietPlanContext.Provider value={value}>{children}</DietPlanContext.Provider>
  );
}

export function useDietPlan(): DietPlanContextValue {
  const context = useContext(DietPlanContext);
  if (!context) {
    throw new Error("useDietPlan must be used within a DietPlanProvider");
  }
  return context;
}
