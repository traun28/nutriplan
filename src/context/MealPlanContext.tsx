"use client";

/**
 * Phase 3 — client state for the 7-day meal planner.
 *
 * Holds the currently open weekly plan plus the saved-plans list, and
 * exposes the server-backed actions (generate, regenerate plan/day/meal,
 * replace, servings, rename, duplicate, delete). All generation happens
 * on the server against the stored profile; the client only renders what
 * comes back and never recomputes nutrition.
 *
 * Plans are fetched once per signed-in user and cached here, so a
 * re-render never triggers a regeneration.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/context/AuthContext";
import { apiClient, ApiError, toUserMessage } from "@/services/apiClient";
import type {
  BudgetLevel,
  MealAlternative,
  WeeklyPlanListItem,
  WeeklyPlanRecord,
} from "@/services/diet/weeklyPlanner";
import type { PlannerSlot } from "@/services/diet/config";

export type MealPlanStatus = "idle" | "loading" | "ready" | "error";
export type MealPlanErrorCode =
  | "PROFILE_INCOMPLETE"
  | "TARGETS_UNAVAILABLE"
  | "INSUFFICIENT_OPTIONS"
  | "VALIDATION_FAILED"
  | "DB_UNAVAILABLE"
  | "UNKNOWN";

export interface ActionResult {
  success: boolean;
  message: string;
  code?: MealPlanErrorCode;
  details?: string[];
}

interface MealPlanContextValue {
  status: MealPlanStatus;
  error: string | null;
  /** The plan currently open in the planner (defaults to the "current" plan). */
  plan: WeeklyPlanRecord | null;
  savedPlans: WeeklyPlanListItem[];
  /** True while any mutating request is in flight (duplicate-request guard). */
  busy: string | null;
  reload: () => Promise<void>;
  openPlan: (id: number) => Promise<ActionResult>;
  generate: (input: { name?: string; startDate?: string | null; budget?: BudgetLevel | null }) => Promise<ActionResult>;
  regeneratePlan: () => Promise<ActionResult>;
  regenerateDay: (dayIndex: number) => Promise<ActionResult>;
  regenerateMeal: (dayIndex: number, slot: PlannerSlot) => Promise<ActionResult>;
  getAlternatives: (dayIndex: number, slot: PlannerSlot) => Promise<MealAlternative[]>;
  replaceMeal: (dayIndex: number, slot: PlannerSlot, foodId: string) => Promise<ActionResult>;
  updateServings: (dayIndex: number, slot: PlannerSlot, foodId: string, servings: number) => Promise<ActionResult>;
  renamePlan: (id: number, name: string) => Promise<ActionResult>;
  setStartDate: (id: number, startDate: string | null) => Promise<ActionResult>;
  makeCurrent: (id: number) => Promise<ActionResult>;
  duplicatePlan: (id: number) => Promise<ActionResult>;
  deletePlan: (id: number) => Promise<ActionResult>;
}

const MealPlanContext = createContext<MealPlanContextValue | null>(null);

function codeOf(error: unknown, payload?: { code?: string }): MealPlanErrorCode {
  const code = payload?.code;
  if (code === "PROFILE_INCOMPLETE" || code === "TARGETS_UNAVAILABLE" || code === "INSUFFICIENT_OPTIONS" || code === "VALIDATION_FAILED" || code === "DB_UNAVAILABLE") {
    return code;
  }
  if (error instanceof ApiError && error.status === 503) return "DB_UNAVAILABLE";
  return "UNKNOWN";
}

/**
 * The shared apiClient only surfaces `error`; planner failures also carry a
 * `code`, so mutating calls go through fetch directly to keep that field.
 */
async function call<T>(path: string, init: RequestInit): Promise<{ ok: true; data: T } | { ok: false; result: ActionResult }> {
  try {
    const response = await fetch(path, {
      ...init,
      headers: { "content-type": "application/json", ...(init.headers ?? {}) },
      credentials: "same-origin",
    });
    const text = await response.text();
    const payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    if (!response.ok) {
      const error = new ApiError("server", String(payload.error ?? "Request failed."), response.status);
      return {
        ok: false,
        result: {
          success: false,
          message: String(payload.error ?? (response.status === 401 ? "Please sign in again." : "The request could not be completed.")),
          code: codeOf(error, payload as { code?: string }),
          details: Array.isArray(payload.details) ? (payload.details as string[]) : undefined,
        },
      };
    }
    return { ok: true, data: payload as T };
  } catch {
    return {
      ok: false,
      result: { success: false, message: "Could not reach the server. Check your connection and try again.", code: "UNKNOWN" },
    };
  }
}

export function MealPlanProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<MealPlanStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<WeeklyPlanRecord | null>(null);
  const [savedPlans, setSavedPlans] = useState<WeeklyPlanListItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef<string | null>(null);
  const loadedFor = useRef<number | null>(null);

  const setBusyKey = (key: string | null) => {
    busyRef.current = key;
    setBusy(key);
  };

  const refreshList = useCallback(async () => {
    const data = await apiClient.get<{ plans: WeeklyPlanListItem[] }>("/api/meal-plans");
    setSavedPlans(data.plans);
  }, []);

  const reload = useCallback(async () => {
    if (!user) return;
    setStatus("loading");
    setError(null);
    try {
      const [current, list] = await Promise.all([
        apiClient.get<{ plan: WeeklyPlanRecord | null }>("/api/meal-plans/current"),
        apiClient.get<{ plans: WeeklyPlanListItem[] }>("/api/meal-plans"),
      ]);
      setPlan(current.plan);
      setSavedPlans(list.plans);
      setStatus("ready");
    } catch (err) {
      setError(toUserMessage(err, "Your saved plans could not be loaded."));
      setStatus("error");
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      loadedFor.current = null;
      const task = setTimeout(() => {
        setPlan(null);
        setSavedPlans([]);
        setStatus("idle");
      }, 0);
      return () => clearTimeout(task);
    }
    if (loadedFor.current === user.id) return;
    loadedFor.current = user.id;
    const task = setTimeout(() => void reload(), 0);
    return () => clearTimeout(task);
  }, [user, reload]);

  /** Runs a mutation with the duplicate-request guard and list refresh. */
  const mutate = useCallback(
    async (
      key: string,
      work: () => Promise<{ ok: true; data: { plan?: WeeklyPlanRecord; message?: string } } | { ok: false; result: ActionResult }>,
      successMessage: string,
      options: { refreshList?: boolean } = {},
    ): Promise<ActionResult> => {
      if (busyRef.current) return { success: false, message: "Please wait for the current action to finish." };
      setBusyKey(key);
      try {
        const outcome = await work();
        if (!outcome.ok) return outcome.result;
        if (outcome.data.plan) setPlan(outcome.data.plan);
        if (options.refreshList !== false) {
          try {
            await refreshList();
          } catch {
            /* list refresh is best-effort */
          }
        }
        return { success: true, message: outcome.data.message ?? successMessage };
      } finally {
        setBusyKey(null);
      }
    },
    [refreshList],
  );

  const openPlan = useCallback(
    async (id: number) =>
      mutate(`open:${id}`, () => call<{ plan: WeeklyPlanRecord }>(`/api/meal-plans/${id}`, { method: "GET" }), "Plan opened.", { refreshList: false }),
    [mutate],
  );

  const generate = useCallback<MealPlanContextValue["generate"]>(
    (input) =>
      mutate(
        "generate",
        () => call<{ plan: WeeklyPlanRecord }>("/api/meal-plans", { method: "POST", body: JSON.stringify(input) }),
        "Your 7-day plan is ready.",
      ),
    [mutate],
  );

  const regenerate = useCallback(
    (body: Record<string, unknown>, key: string, fallback: string) => {
      if (!plan) return Promise.resolve({ success: false, message: "Generate a plan first." });
      return mutate(
        key,
        () => call<{ plan: WeeklyPlanRecord; message: string }>(`/api/meal-plans/${plan.id}/regenerate`, { method: "POST", body: JSON.stringify(body) }),
        fallback,
      );
    },
    [mutate, plan],
  );

  const regeneratePlan = useCallback(() => regenerate({}, "regenerate", "Plan regenerated."), [regenerate]);
  const regenerateDay = useCallback((dayIndex: number) => regenerate({ dayIndex }, `day:${dayIndex}`, "Day regenerated."), [regenerate]);
  const regenerateMeal = useCallback(
    (dayIndex: number, slot: PlannerSlot) => regenerate({ dayIndex, slot }, `meal:${dayIndex}:${slot}`, "Meal regenerated."),
    [regenerate],
  );

  const getAlternatives = useCallback(
    async (dayIndex: number, slot: PlannerSlot) => {
      if (!plan) return [];
      try {
        const data = await apiClient.get<{ alternatives: MealAlternative[] }>(
          `/api/meal-plans/${plan.id}/alternatives?dayIndex=${dayIndex}&slot=${encodeURIComponent(slot)}`,
        );
        return data.alternatives;
      } catch {
        return [];
      }
    },
    [plan],
  );

  const replaceMeal = useCallback(
    (dayIndex: number, slot: PlannerSlot, foodId: string) => {
      if (!plan) return Promise.resolve({ success: false, message: "Generate a plan first." });
      return mutate(
        `replace:${dayIndex}:${slot}`,
        () =>
          call<{ plan: WeeklyPlanRecord; message: string }>(`/api/meal-plans/${plan.id}/replace`, {
            method: "POST",
            body: JSON.stringify({ dayIndex, slot, foodId }),
          }),
        "Meal replaced.",
      );
    },
    [mutate, plan],
  );

  const updateServings = useCallback(
    (dayIndex: number, slot: PlannerSlot, foodId: string, servings: number) => {
      if (!plan) return Promise.resolve({ success: false, message: "Generate a plan first." });
      return mutate(
        `servings:${dayIndex}:${slot}:${foodId}`,
        () =>
          call<{ plan: WeeklyPlanRecord; message: string }>(`/api/meal-plans/${plan.id}/servings`, {
            method: "POST",
            body: JSON.stringify({ dayIndex, slot, foodId, servings }),
          }),
        "Serving size updated.",
      );
    },
    [mutate, plan],
  );

  const patchPlan = useCallback(
    (id: number, body: Record<string, unknown>, key: string, message: string) =>
      mutate(
        key,
        async () => {
          const outcome = await call<{ plan: WeeklyPlanRecord }>(`/api/meal-plans/${id}`, { method: "PATCH", body: JSON.stringify(body) });
          if (!outcome.ok) return outcome;
          // Only swap the open plan when it is the one edited.
          return { ok: true, data: { plan: plan?.id === id || body.isCurrent === true ? outcome.data.plan : undefined } };
        },
        message,
      ),
    [mutate, plan],
  );

  const renamePlan = useCallback((id: number, name: string) => patchPlan(id, { name }, `rename:${id}`, "Plan renamed."), [patchPlan]);
  const setStartDate = useCallback(
    (id: number, startDate: string | null) => patchPlan(id, { startDate }, `date:${id}`, startDate ? "Start date saved." : "Start date cleared."),
    [patchPlan],
  );
  const makeCurrent = useCallback((id: number) => patchPlan(id, { isCurrent: true }, `current:${id}`, "This is now your current plan."), [patchPlan]);

  const duplicatePlan = useCallback(
    (id: number) =>
      mutate(
        `duplicate:${id}`,
        async () => {
          const outcome = await call<{ plan: WeeklyPlanRecord }>(`/api/meal-plans/${id}/duplicate`, { method: "POST", body: "{}" });
          return outcome.ok ? { ok: true, data: {} } : outcome;
        },
        "Plan duplicated.",
      ),
    [mutate],
  );

  const deletePlan = useCallback(
    (id: number) =>
      mutate(
        `delete:${id}`,
        async () => {
          const outcome = await call<{ ok: boolean }>(`/api/meal-plans/${id}`, { method: "DELETE" });
          if (!outcome.ok) return outcome;
          if (plan?.id === id) {
            // Fall back to whichever plan is now current (may be none).
            const current = await call<{ plan: WeeklyPlanRecord | null }>("/api/meal-plans/current", { method: "GET" });
            setPlan(current.ok ? current.data.plan : null);
          }
          return { ok: true, data: {} };
        },
        "Plan deleted.",
      ),
    [mutate, plan],
  );

  const value = useMemo<MealPlanContextValue>(
    () => ({
      status,
      error,
      plan,
      savedPlans,
      busy,
      reload,
      openPlan,
      generate,
      regeneratePlan,
      regenerateDay,
      regenerateMeal,
      getAlternatives,
      replaceMeal,
      updateServings,
      renamePlan,
      setStartDate,
      makeCurrent,
      duplicatePlan,
      deletePlan,
    }),
    [status, error, plan, savedPlans, busy, reload, openPlan, generate, regeneratePlan, regenerateDay, regenerateMeal, getAlternatives, replaceMeal, updateServings, renamePlan, setStartDate, makeCurrent, duplicatePlan, deletePlan],
  );

  return <MealPlanContext.Provider value={value}>{children}</MealPlanContext.Provider>;
}

export function useMealPlan(): MealPlanContextValue {
  const context = useContext(MealPlanContext);
  if (!context) throw new Error("useMealPlan must be used within a MealPlanProvider");
  return context;
}
