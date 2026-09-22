"use client";

/**
 * Phase 2 — the daily nutrition command centre.
 *
 * Built from the same page chrome as the Nutrition and Diet Plan pages
 * (eyebrow · title · description · card grid). It reads:
 *   profile / processed  — Parts 2–6 (greeting, goal, targets)
 *   plan                 — Part 7/8 (next meal)
 *   DayLogContext        — Phase 2 (entries, water, favourites)
 * and never calculates nutrition itself.
 */
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/context/AuthContext";
import { useProfile } from "@/context/ProfileContext";
import { useNutrition } from "@/context/NutritionContext";
import { useDietPlan } from "@/context/DietPlanContext";
import { useDayLog } from "@/context/DayLogContext";
import { Badge, Button } from "@/components/ui/core";
import { DailySummary } from "@/components/dashboard/DailySummary";
import { TodaysMeals } from "@/components/dashboard/TodaysMeals";
import { WaterTracker } from "@/components/dashboard/WaterTracker";
import {
  buildRecommendations,
  findNextMeal,
  NextMealCard,
  QuickActions,
  RecommendationCard,
} from "@/components/dashboard/DashboardAside";
import { FoodLogDialog } from "@/components/food-log/FoodLogDialog";
import { PlannedMealsCard } from "@/components/dashboard/PlannedMealsCard";
import { Toast, useToast } from "@/components/ui/Toast";
import { shiftDateKey, targetsFromProcessed, toDateKey } from "@/services/foodLog/calculations";
import type { FoodLogEntry, FoodLogMealType } from "@/services/foodLog/types";
import { cn } from "@/lib/cn";

interface LoggerState {
  open: boolean;
  entry: FoodLogEntry | null;
  mealType?: FoodLogMealType;
  foodId?: string;
  servings?: number;
  date?: string;
}

function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatLongDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function DailyDashboardView() {
  const { user } = useAuth();
  const { profile, hydrated } = useProfile();
  const { processed, isStale } = useNutrition();
  const { plan } = useDietPlan();
  const day = useDayLog();
  const { toast, show: showToast, dismiss } = useToast();

  const [logger, setLogger] = useState<LoggerState>({ open: false, entry: null });
  const [hour, setHour] = useState<number | null>(null);
  useEffect(() => {
    const task = setTimeout(() => setHour(new Date().getHours()), 0);
    return () => clearTimeout(task);
  }, []);

  const firstName =
    profile.personalDetails.fullName.trim().split(" ")[0] || user?.fullName.trim().split(" ")[0] || "";

  const targets = useMemo(() => targetsFromProcessed(processed), [processed]);
  const hasTargets = targets.calories !== null || targets.protein !== null;
  const loading = day.status === "loading" || day.status === "idle";

  const nextMeal = useMemo(() => findNextMeal(plan, day.entries, day.isToday), [plan, day.entries, day.isToday]);

  const tips = useMemo(
    () =>
      buildRecommendations({
        totals: day.totals,
        targets,
        entries: day.entries,
        waterTotalMl: day.waterTotalMl,
        waterTargetMl: day.waterTargetMl,
        isToday: day.isToday,
        hasTargets,
      }),
    [day.totals, targets, day.entries, day.waterTotalMl, day.waterTargetMl, day.isToday, hasTargets],
  );

  const openLogger = useCallback(
    (mealType?: FoodLogMealType, foodId?: string, servings?: number) =>
      setLogger({ open: true, entry: null, mealType, foodId, servings, date: day.selectedDate }),
    [day.selectedDate],
  );
  const closeLogger = useCallback(() => setLogger((current) => ({ ...current, open: false })), []);

  const notice = useCallback(
    (message: string, tone: "success" | "error" = "success") => showToast(message, tone),
    [showToast],
  );

  const contextualMessage = !hydrated
    ? ""
    : !hasTargets
      ? "Log your meals and set up your nutrition targets to see how each day compares."
      : day.isToday
        ? day.entries.length === 0
          ? "Your nutrition plan for today — log your first meal to get started."
          : "Your nutrition plan for today."
        : `Your nutrition log for ${formatLongDate(day.selectedDate)}.`;

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:py-14">
      {/* ------------------------------ header ----------------------------- */}
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-400">Dashboard</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            {hour === null ? "Welcome" : greetingFor(hour)}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">{contextualMessage}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge>
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              {formatLongDate(day.selectedDate)}
            </Badge>
            {processed?.goal?.label && <Badge tone="brand">Goal: {processed.goal.label}</Badge>}
            {targets.calories !== null && <Badge>{Math.round(targets.calories).toLocaleString()} kcal target</Badge>}
          </div>
        </div>

        <DateSwitcher
          date={day.selectedDate}
          onChange={day.setSelectedDate}
          isToday={day.isToday}
          disabled={day.status === "loading"}
        />
      </header>

      {/* ------------------------------ error ------------------------------ */}
      {day.status === "error" && (
        <div
          role="alert"
          className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-card border border-danger-500/30 bg-danger-50/60 p-4"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger-600" aria-hidden="true" />
            <p className="text-sm text-danger-700">{day.error}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void day.reload()} icon={<RefreshCw className="h-3.5 w-3.5" />}>
            Retry
          </Button>
        </div>
      )}

      {/* ------------------------------ layout ----------------------------- */}
      <div className="space-y-5">
        <DailySummary totals={day.totals} targets={targets} loading={loading} hasTargets={hasTargets} targetsStale={isStale && hasTargets} />

        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div id="todays-meals" className="scroll-mt-24 space-y-5">
            <PlannedMealsCard date={day.selectedDate} entries={day.entries} onLog={openLogger} />
            <TodaysMeals
              entries={day.entries}
              loading={loading}
              isToday={day.isToday}
              onLog={(mealType) => openLogger(mealType)}
              onEdit={(entry) => setLogger({ open: true, entry })}
              onRepeat={(entry) =>
                setLogger({
                  open: true,
                  entry: null,
                  mealType: entry.mealType,
                  foodId: entry.foodId,
                  servings: entry.servings,
                  date: toDateKey(),
                })
              }
              onNotice={notice}
            />
          </div>

          <aside className="space-y-5">
            <QuickActions onLog={() => openLogger()} hasPlan={plan !== null} />
            {nextMeal && <NextMealCard meal={nextMeal} onLog={openLogger} />}
            <WaterTracker loading={loading} onNotice={notice} />
            {!loading && <RecommendationCard tips={tips} />}
          </aside>
        </div>
      </div>

      <FoodLogDialog
        open={logger.open}
        onClose={closeLogger}
        entry={logger.entry}
        defaultDate={logger.date}
        defaultMealType={logger.mealType}
        defaultFoodId={logger.foodId}
        defaultServings={logger.servings}
        onSaved={(entry, mode) => {
          const dateNote = entry.logDate !== day.selectedDate ? ` on ${formatLongDate(entry.logDate)}` : "";
          notice(mode === "edit" ? `Updated ${entry.foodName}.` : `Logged ${entry.foodName}${dateNote}.`);
        }}
      />

      <Toast toast={toast} onDismiss={dismiss} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Date switcher                                                       */
/* ------------------------------------------------------------------ */

function DateSwitcher({
  date,
  onChange,
  isToday,
  disabled,
}: {
  date: string;
  onChange: (date: string) => void;
  isToday: boolean;
  disabled?: boolean;
}) {
  const today = toDateKey();
  const canGoForward = date < today;
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Change day">
      <button
        type="button"
        onClick={() => onChange(shiftDateKey(date, -1))}
        disabled={disabled}
        aria-label="Previous day"
        className="grid h-9 w-9 place-items-center rounded-[10px] border border-line bg-surface text-ink transition-colors hover:border-brand-400/50 hover:text-brand-400 disabled:opacity-50"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>
      <label className="sr-only" htmlFor="dashboard-date">
        Selected date
      </label>
      <input
        id="dashboard-date"
        type="date"
        value={date}
        max={today}
        onChange={(event) => {
          if (event.target.value && event.target.value <= today) onChange(event.target.value);
        }}
        className="min-h-[36px] rounded-[10px] border border-line bg-surface px-3 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15"
      />
      <button
        type="button"
        onClick={() => onChange(shiftDateKey(date, 1))}
        disabled={disabled || !canGoForward}
        aria-label="Next day"
        className="grid h-9 w-9 place-items-center rounded-[10px] border border-line bg-surface text-ink transition-colors hover:border-brand-400/50 hover:text-brand-400 disabled:opacity-50"
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => onChange(today)}
        disabled={disabled || isToday}
        className={cn(
          "rounded-pill border px-3 py-1.5 text-xs font-semibold transition-colors",
          isToday
            ? "border-brand-600 bg-brand-700 text-white"
            : "border-line bg-surface text-muted hover:border-brand-400/50 hover:text-brand-400",
        )}
      >
        Today
      </button>
    </div>
  );
}

/** Protected route: requires an authenticated session. */
export function DailyDashboard() {
  return (
    <RequireAuth>
      <DailyDashboardView />
    </RequireAuth>
  );
}
