"use client";

/**
 * Phase 3 — the 7-day meal planner page body.
 *
 * Flow: auth (RequireAuth) → profile completeness → targets → generate on
 * the server → display. The open plan lives in MealPlanContext; the day
 * selector is local UI state. "Log this meal" reuses the Phase 2 food
 * logger, and today's meals show their logged status from DayLogContext.
 */
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Loader2,
  RefreshCw,
  Salad,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { PlannedMeal } from "@/types/profile";
import { useProfile } from "@/context/ProfileContext";
import { useNutrition } from "@/context/NutritionContext";
import { useDayLog } from "@/context/DayLogContext";
import { useMealPlan, type ActionResult } from "@/context/MealPlanContext";
import { Badge, Button, Card, EmptyState } from "@/components/ui/core";
import { Toast, useToast } from "@/components/ui/Toast";
import { FoodLogDialog } from "@/components/food-log/FoodLogDialog";
import { WeeklyMealCard } from "@/components/meal-plan/WeeklyMealCard";
import { SavedPlans } from "@/components/meal-plan/SavedPlans";
import { DailyTotalsCard, Stat, fmt } from "@/components/meal-plan/planUi";
import { BUDGET_LEVELS, dayIndexForDate, type BudgetLevel } from "@/services/diet/weeklyPlanner";
import { toDateKey } from "@/services/foodLog/calculations";
import type { FoodLogMealType } from "@/services/foodLog/types";
import { cn } from "@/lib/cn";

interface LoggerState {
  open: boolean;
  mealType?: FoodLogMealType;
  foodId?: string;
  servings?: number;
}

export function WeeklyPlanner() {
  const { hydrated, completion } = useProfile();
  const { processed } = useNutrition();
  const day = useDayLog();
  const mealPlan = useMealPlan();
  const { toast, show, dismiss } = useToast();

  // Day selection is keyed by plan id so opening a different plan resets
  // it (to today's day when the plan covers today) without an effect.
  const [daySelection, setDaySelection] = useState<{ planId: number | null; dayIndex: number } | null>(null);
  const [name, setName] = useState("My Weekly Plan");
  const [budget, setBudget] = useState<BudgetLevel>("medium");
  const [preferPantry, setPreferPantry] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [failure, setFailure] = useState<ActionResult | null>(null);
  const [logger, setLogger] = useState<LoggerState>({ open: false });

  const plan = mealPlan.plan;
  const today = toDateKey();
  const todayIndex = plan ? dayIndexForDate(plan.startDate, today) : null;

  const selectedDay =
    daySelection && daySelection.planId === (plan?.id ?? null) ? daySelection.dayIndex : (todayIndex ?? 0);
  const setSelectedDay = (dayIndex: number) => setDaySelection({ planId: plan?.id ?? null, dayIndex });

  const notice = (result: ActionResult) => show(result.message, result.success ? "success" : "error");

  const loggedSlots = useMemo(() => {
    if (!day.isToday) return null;
    return new Set(day.entries.map((entry) => entry.mealType));
  }, [day.entries, day.isToday]);

  const openLogger = (meal: PlannedMeal) => {
    const first = meal.items[0];
    setLogger({ open: true, mealType: meal.type, foodId: first?.foodId, servings: first?.servings });
  };

  /* ----------------------------- loading ------------------------------ */
  if (!hydrated || mealPlan.status === "loading" || mealPlan.status === "idle") {
    return (
      <Shell>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="h-72 animate-pulse rounded-card bg-line/30" />
          <div className="h-56 animate-pulse rounded-card bg-line/40" />
        </div>
      </Shell>
    );
  }

  /* ------------------------- profile incomplete ----------------------- */
  if (!completion.personalComplete || !completion.nutritionComplete) {
    return (
      <Shell>
        <EmptyState
          icon={<UserRound className="h-6 w-6" aria-hidden="true" />}
          title="Complete your nutrition profile before generating a personalized plan."
          description="Your 7-day plan is built from your saved profile — age, goal, dietary type, allergies, preferences and calculated targets."
          action={
            <Button href="/planner" icon={<ArrowRight className="h-4 w-4" />}>
              Complete profile
            </Button>
          }
        />
      </Shell>
    );
  }

  const targetsReady = processed !== null && processed.status === "complete";

  const generate = async () => {
    setFailure(null);
    const result = await mealPlan.generate({ name, budget, startDate: startDate || null, preferPantry });
    if (result.success) show(result.message, "success");
    else setFailure(result);
  };

  const regeneratePlan = async () => {
    setFailure(null);
    const result = await mealPlan.regeneratePlan();
    if (result.success) show(result.message, "success");
    else setFailure(result);
  };

  const regenerateDay = async () => {
    const result = await mealPlan.regenerateDay(selectedDay);
    notice(result);
  };

  const current = plan?.data.days.find((d) => d.dayIndex === selectedDay) ?? plan?.data.days[0] ?? null;
  const generating = mealPlan.busy === "generate" || mealPlan.busy === "regenerate";

  return (
    <Shell
      badges={
        plan ? (
          <>
            <Badge tone="brand">{plan.name}</Badge>
            <Badge>{fmt(plan.data.targets.calories)} kcal/day target</Badge>
            {plan.data.options.budget && <Badge>Budget: {plan.data.options.budget}</Badge>}
            {plan.data.options.preferPantry && <Badge>Prefers pantry ingredients</Badge>}
          </>
        ) : null
      }
    >
      {mealPlan.status === "error" && (
        <Notice tone="error" message={mealPlan.error ?? "Your plans could not be loaded."} action={<Button size="sm" variant="outline" onClick={() => void mealPlan.reload()}>Retry</Button>} />
      )}

      {failure && (
        <Notice
          tone="error"
          message={failure.message}
          details={failure.details}
          action={
            failure.code === "PROFILE_INCOMPLETE" ? (
              <Button size="sm" variant="outline" href="/planner">Complete profile</Button>
            ) : failure.code === "TARGETS_UNAVAILABLE" ? (
              <Button size="sm" variant="outline" href="/nutrition">Calculate nutrition</Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setFailure(null)}>Dismiss</Button>
            )
          }
        />
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          {/* ---------------------------- generator ---------------------------- */}
          {!plan && !generating && (
            <Card>
              <div className="border-b border-line bg-brand-50/60 px-5 py-3.5">
                <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
                  <Sparkles className="h-4 w-4 text-brand-400" aria-hidden="true" />
                  Generate your 7-day plan
                </h2>
              </div>
              <div className="p-5">
                {!targetsReady && (
                  <Notice tone="warning" message="Your nutrition targets are not calculated yet. Generation will use your saved profile to calculate them, or you can review them first." action={<Button size="sm" variant="outline" href="/nutrition">Review targets</Button>} />
                )}
                <GeneratorForm name={name} setName={setName} budget={budget} setBudget={setBudget} startDate={startDate} setStartDate={setStartDate} preferPantry={preferPantry} setPreferPantry={setPreferPantry} />
                <div className="mt-4">
                  <Button onClick={() => void generate()} disabled={mealPlan.busy !== null} icon={<Sparkles className="h-4 w-4" />}>
                    Generate 7-Day Plan
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {generating && (
            <div className="flex flex-col items-center rounded-card border border-line bg-surface px-6 py-16 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-brand-400" aria-hidden="true" />
              <p className="mt-4 text-base font-bold text-ink" role="status">
                Creating your 7-day plan…
              </p>
              <p className="mt-1 text-sm text-muted">Checking restrictions, choosing meals for each day and validating every one.</p>
            </div>
          )}

          {plan && current && !generating && (
            <>
              {/* --------------------------- day selector -------------------------- */}
              <div role="tablist" aria-label="Day of the week" className="flex gap-1.5 overflow-x-auto pb-1">
                {plan.data.days.map((d) => {
                  const active = d.dayIndex === selectedDay;
                  return (
                    <button
                      key={d.dayIndex}
                      role="tab"
                      type="button"
                      aria-selected={active}
                      onClick={() => setSelectedDay(d.dayIndex)}
                      className={cn(
                        "flex min-w-[64px] flex-1 flex-col items-center rounded-[10px] border px-2 py-2 text-xs font-semibold transition-colors",
                        active ? "border-brand-600 bg-brand-700 text-white" : "border-line bg-surface text-ink hover:border-brand-400/50",
                      )}
                    >
                      <span>{d.weekday}</span>
                      <span className={cn("text-[10px] font-medium", active ? "text-white/80" : "text-muted")}>{d.label}</span>
                      {todayIndex === d.dayIndex && <span className={cn("mt-0.5 text-[9px] uppercase tracking-wide", active ? "text-white/80" : "text-brand-400")}>Today</span>}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-ink">
                  {current.label} · {current.weekday}
                  {current.date && <span className="ml-2 text-sm font-medium text-muted">{formatKey(current.date)}</span>}
                </h2>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => void regenerateDay()} disabled={mealPlan.busy !== null} loading={mealPlan.busy === `day:${selectedDay}`} icon={<RefreshCw className="h-3.5 w-3.5" />}>
                    Regenerate day
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void regeneratePlan()} disabled={mealPlan.busy !== null} icon={<Sparkles className="h-3.5 w-3.5" />}>
                    Regenerate plan
                  </Button>
                </div>
              </div>

              <div className="space-y-4">
                {current.plan.meals.map((meal, index) => (
                  <WeeklyMealCard
                    key={meal.id}
                    meal={meal}
                    index={index}
                    dayIndex={current.dayIndex}
                    logged={todayIndex === current.dayIndex && loggedSlots ? loggedSlots.has(meal.type) : null}
                    onLog={todayIndex === current.dayIndex ? openLogger : undefined}
                    onNotice={notice}
                  />
                ))}
              </div>

              <DailyTotalsCard day={current} targets={plan.data.targets} />
            </>
          )}
        </div>

        {/* ------------------------------ aside ------------------------------ */}
        <aside className="space-y-4">
          {plan && (
            <Card>
              <div className="border-b border-line bg-brand-50/60 px-5 py-3.5">
                <h2 className="text-sm font-bold text-ink">Weekly summary</h2>
              </div>
              <div className="grid grid-cols-2 gap-2 p-4">
                <Stat label="Avg calories" value={fmt(plan.data.summary.averageCalories)} unit="kcal" />
                <Stat label="Avg protein" value={fmt(plan.data.summary.averageProtein, 1)} unit="g" />
                <Stat label="Avg carbs" value={fmt(plan.data.summary.averageCarbohydrates, 1)} unit="g" />
                <Stat label="Avg fat" value={fmt(plan.data.summary.averageFat, 1)} unit="g" />
                <Stat label="Meals planned" value={`${plan.data.summary.mealCount}`} />
                <Stat label="Days on calorie target" value={`${plan.data.summary.daysOnCalorieTarget} / ${plan.data.days.length}`} />
              </div>
              <p className="px-4 pb-3 text-[11px] text-muted">Averages are computed from the planned meals. Fibre is not available in the food database.</p>
              <div className="border-t border-line px-4 py-3">
                <details>
                  <summary className="cursor-pointer text-xs font-semibold text-brand-400">Generate another plan</summary>
                  <div className="mt-3">
                    <GeneratorForm name={name} setName={setName} budget={budget} setBudget={setBudget} startDate={startDate} setStartDate={setStartDate} preferPantry={preferPantry} setPreferPantry={setPreferPantry} compact />
                    <Button size="sm" className="mt-3" onClick={() => void generate()} disabled={mealPlan.busy !== null} icon={<Sparkles className="h-3.5 w-3.5" />}>
                      Generate new plan
                    </Button>
                    <p className="mt-2 text-[11px] text-muted">Your existing saved plans are kept.</p>
                  </div>
                </details>
              </div>
            </Card>
          )}
          <SavedPlans onNotice={notice} />
          <Button href="/diet-plan" variant="ghost" size="sm" icon={<Salad className="h-3.5 w-3.5" />}>
            Single-day diet plan
          </Button>
        </aside>
      </div>

      <FoodLogDialog
        open={logger.open}
        onClose={() => setLogger((s) => ({ ...s, open: false }))}
        defaultDate={today}
        defaultMealType={logger.mealType}
        defaultFoodId={logger.foodId}
        defaultServings={logger.servings}
        onSaved={(entry) => show(`Logged ${entry.foodName}.`, "success")}
      />
      <Toast toast={toast} onDismiss={dismiss} />
    </Shell>
  );
}

/* ------------------------------------------------------------------ */

function GeneratorForm({
  name,
  setName,
  budget,
  setBudget,
  startDate,
  setStartDate,
  preferPantry,
  setPreferPantry,
  compact,
}: {
  name: string;
  setName: (v: string) => void;
  budget: BudgetLevel;
  setBudget: (v: BudgetLevel) => void;
  startDate: string;
  setStartDate: (v: string) => void;
  preferPantry: boolean;
  setPreferPantry: (v: boolean) => void;
  compact?: boolean;
}) {
  const input = "w-full rounded-[10px] border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15";
  return (
    <div className={cn("grid gap-3", compact ? "" : "sm:grid-cols-3")}>
      <div>
        <label htmlFor="mp-name" className="text-xs font-semibold text-ink">Plan name</label>
        <input id="mp-name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className={cn(input, "mt-1")} />
      </div>
      <div>
        <label htmlFor="mp-budget" className="text-xs font-semibold text-ink">Budget level</label>
        <select id="mp-budget" value={budget} onChange={(e) => setBudget(e.target.value as BudgetLevel)} className={cn(input, "mt-1")}>
          {BUDGET_LEVELS.map((level) => (
            <option key={level.id} value={level.id}>{level.label}</option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-muted">{BUDGET_LEVELS.find((l) => l.id === budget)?.hint}</p>
      </div>
      <div>
        <label htmlFor="mp-start" className="text-xs font-semibold text-ink">Start date (optional)</label>
        <input id="mp-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={cn(input, "mt-1")} />
        <p className="mt-1 text-[11px] text-muted">Day 1 maps to this date; otherwise Day 1 is Monday.</p>
      </div>
      <div className={compact ? "" : "sm:col-span-3"}>
        <label className="inline-flex items-start gap-2 text-sm text-ink">
          <input type="checkbox" checked={preferPantry} onChange={(e) => setPreferPantry(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-line text-brand-500 focus:ring-brand-500" />
          <span>
            Prefer pantry ingredients
            <span className="block text-[11px] text-muted">Nudges the planner toward recipes using what&apos;s in your <a href="/pantry" className="font-semibold text-brand-600 hover:underline">pantry</a>. Allergies, dietary type and nutrition targets are never relaxed.</span>
          </span>
        </label>
      </div>
    </div>
  );
}

function Notice({ tone, message, details, action }: { tone: "error" | "warning"; message: string; details?: string[]; action?: React.ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "mb-5 flex flex-wrap items-start justify-between gap-3 rounded-card border p-4",
        tone === "error" ? "border-danger-500/30 bg-danger-50/60" : "border-accent-300/40 bg-accent-200/30",
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0", tone === "error" ? "text-danger-600" : "text-accent-300")} aria-hidden="true" />
        <div>
          <p className={cn("text-sm", tone === "error" ? "text-danger-700" : "text-ink")}>{message}</p>
          {details && details.length > 0 && (
            <ul className="mt-1 list-disc pl-4 text-xs text-muted">
              {details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {action}
    </div>
  );
}

function formatKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function Shell({ children, badges }: { children: React.ReactNode; badges?: React.ReactNode }) {
  return (
    <div className="page-container page-section">
      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-400">Weekly planner</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">Your 7-Day Meal Plan</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
          Seven days of meals built from your profile and nutrition targets, with safe swaps for any meal.
        </p>
        {badges && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge>
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />7 days
            </Badge>
            {badges}
          </div>
        )}
      </header>
      {children}
    </div>
  );
}
