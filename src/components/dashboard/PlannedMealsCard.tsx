"use client";

/**
 * Phase 3 — today's meals from the current 7-day plan, with a simple
 * planned-vs-logged indicator per slot and "Log this meal" via the Phase 2
 * logger. Renders nothing when there is no current weekly plan or the
 * selected date is outside it.
 */
import { ArrowRight, CalendarCheck, Check, Plus } from "lucide-react";
import { useMemo } from "react";
import type { PlannedMeal } from "@/types/profile";
import { useMealPlan } from "@/context/MealPlanContext";
import { Button, Card } from "@/components/ui/core";
import { formatTime } from "@/data/options";
import { dayIndexForDate } from "@/services/diet/weeklyPlanner";
import type { FoodLogEntry, FoodLogMealType } from "@/services/foodLog/types";
import { cn } from "@/lib/cn";

export function PlannedMealsCard({
  date,
  entries,
  onLog,
}: {
  date: string;
  entries: FoodLogEntry[];
  onLog: (mealType: FoodLogMealType, foodId?: string, servings?: number) => void;
}) {
  const { plan, status } = useMealPlan();
  const day = useMemo(() => {
    if (!plan) return null;
    const index = dayIndexForDate(plan.startDate, date);
    return index === null ? null : plan.data.days.find((d) => d.dayIndex === index) ?? null;
  }, [plan, date]);

  if (status !== "ready" || !plan) return null;

  const logged = new Set(entries.map((entry) => entry.mealType));
  const meals: PlannedMeal[] = day?.plan.meals ?? [];
  const loggedCount = meals.filter((meal) => logged.has(meal.type)).length;

  return (
    <Card>
      <div className="flex items-center justify-between gap-3 border-b border-line bg-brand-50/60 px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
          <CalendarCheck className="h-4 w-4 text-brand-400" aria-hidden="true" />
          Planned meals
        </h2>
        {day && (
          <span className="text-xs font-semibold text-muted">
            {loggedCount} / {meals.length} logged
          </span>
        )}
      </div>
      {!day ? (
        <div className="p-5 text-sm text-muted">
          This date is outside &ldquo;{plan.name}&rdquo;.
          <Button href="/meal-plan" size="sm" variant="ghost" className="mt-2" icon={<ArrowRight className="h-3.5 w-3.5" />}>
            Open weekly plan
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {meals.map((meal) => {
            const done = logged.has(meal.type);
            const first = meal.items[0];
            return (
              <li key={meal.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-brand-300">
                    {meal.label} · {formatTime(meal.time)}
                  </p>
                  <p className="truncate text-sm font-semibold text-ink">{meal.name}</p>
                  <p className="text-xs text-muted">
                    {meal.calories} kcal · P {Math.round(meal.proteinGrams)} g · C {Math.round(meal.carbohydrateGrams)} g · F {Math.round(meal.fatGrams)} g
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-pill border px-2.5 py-1 text-[11px] font-semibold",
                      done ? "border-brand-400/25 bg-brand-50 text-brand-400" : "border-line bg-surface text-muted",
                    )}
                  >
                    {done && <Check className="h-3 w-3" aria-hidden="true" />}
                    {done ? "Logged" : "Not logged"}
                  </span>
                  {!done && (
                    <Button size="sm" variant="outline" onClick={() => onLog(meal.type, first?.foodId, first?.servings)} icon={<Plus className="h-3.5 w-3.5" />}>
                      Log this meal
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
          <li className="px-5 py-3">
            <Button href="/meal-plan" size="sm" variant="ghost" icon={<ArrowRight className="h-3.5 w-3.5" />}>
              View {day.label} in weekly plan
            </Button>
          </li>
        </ul>
      )}
    </Card>
  );
}
