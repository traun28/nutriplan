"use client";

/**
 * Phase 2 — supporting dashboard cards:
 *   • QuickActions — links to existing pages + Log Food
 *   • NextMealCard — the next unlogged meal from the generated plan (only
 *     rendered when a plan actually exists; nothing is fabricated)
 *   • RecommendationCard — short, data-driven nudges (no medical advice)
 */
import {
  ArrowRight,
  BarChart3,
  Calculator,
  CalendarCheck,
  Clock,
  Droplets,
  History,
  Lightbulb,
  Plus,
  Sparkles,
  UtensilsCrossed,
} from "lucide-react";
import type { DietPlan, PlannedMeal } from "@/types/profile";
import { Button, Card } from "@/components/ui/core";
import { formatTime } from "@/data/options";
import { formatLitres } from "@/services/foodLog/water";
import { remainingOf } from "@/services/foodLog/calculations";
import { foodLogMealLabel, type DailyTargets, type DailyTotals, type FoodLogEntry, type FoodLogMealType } from "@/services/foodLog/types";

/* ------------------------------------------------------------------ */
/* Quick actions                                                       */
/* ------------------------------------------------------------------ */

export function QuickActions({ onLog, hasPlan }: { onLog: () => void; hasPlan: boolean }) {
  return (
    <Card>
      <div className="border-b border-line bg-brand-50/60 px-5 py-3.5">
        <h2 className="text-sm font-bold text-ink">Quick actions</h2>
      </div>
      <div className="grid grid-cols-2 gap-2 p-4">
        <Button onClick={onLog} size="sm" icon={<Plus className="h-3.5 w-3.5" />} className="col-span-2">
          Log food
        </Button>
        <Button href="#todays-meals" size="sm" variant="outline" icon={<UtensilsCrossed className="h-3.5 w-3.5" />}>
          Today&rsquo;s meals
        </Button>
        <Button href="/diet-plan" size="sm" variant="outline" icon={<Sparkles className="h-3.5 w-3.5" />}>
          {hasPlan ? "Diet plan" : "Generate plan"}
        </Button>
        <Button href="/nutrition" size="sm" variant="outline" icon={<Calculator className="h-3.5 w-3.5" />}>
          Nutrition
        </Button>
        <Button href="/history" size="sm" variant="outline" icon={<History className="h-3.5 w-3.5" />}>
          Food history
        </Button>
        <Button href="/meal-plan" size="sm" variant="outline" icon={<CalendarCheck className="h-3.5 w-3.5" />} className="col-span-2">
          7-day meal plan
        </Button>
        <Button href="/analytics" size="sm" variant="ghost" icon={<BarChart3 className="h-3.5 w-3.5" />}>
          Analytics
        </Button>
        <Button href="/assistant" size="sm" variant="ghost" icon={<Sparkles className="h-3.5 w-3.5" />}>
          Ask assistant
        </Button>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Next meal                                                           */
/* ------------------------------------------------------------------ */

/** Meal slots in the generated plan share ids with the logger. */
export function findNextMeal(plan: DietPlan | null, entries: FoodLogEntry[], isToday: boolean): PlannedMeal | null {
  if (!plan || !isToday) return null;
  const logged = new Set(entries.map((entry) => entry.mealType));
  const now = new Date();
  const nowKey = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const unlogged = plan.meals.filter((meal) => !logged.has(meal.type));
  if (unlogged.length === 0) return null;
  // Prefer the first unlogged meal still ahead of now; else the earliest one.
  return unlogged.find((meal) => meal.time >= nowKey) ?? unlogged[0];
}

export function NextMealCard({ meal, onLog }: { meal: PlannedMeal; onLog: (mealType: FoodLogMealType, foodId?: string, servings?: number) => void }) {
  const firstItem = meal.items[0];
  return (
    <Card className="card-hover">
      <div className="flex items-center justify-between gap-3 border-b border-line bg-brand-50/60 px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
          <Clock className="h-4 w-4 text-brand-400" aria-hidden="true" />
          Next meal
        </h2>
        <span className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-1 text-xs font-semibold text-ink">
          {formatTime(meal.time)}
        </span>
      </div>
      <div className="p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-brand-300">{meal.label}</p>
        <h3 className="mt-1 text-base font-bold leading-snug text-ink">{meal.name}</h3>
        <p className="mt-1.5 text-xs text-muted">
          About <strong className="text-ink">{meal.calories} kcal</strong> · P {Math.round(meal.proteinGrams)} g · C{" "}
          {Math.round(meal.carbohydrateGrams)} g · F {Math.round(meal.fatGrams)} g
        </p>
        {meal.items.length > 1 && (
          <p className="mt-1 text-xs text-muted">
            {meal.items.map((item) => `${item.name} (${item.portionLabel})`).join(", ")}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => onLog(meal.type, firstItem?.foodId, firstItem?.servings)}
            icon={<Plus className="h-3.5 w-3.5" />}
          >
            Log this meal
          </Button>
          <Button href="/diet-plan" size="sm" variant="ghost" icon={<ArrowRight className="h-3.5 w-3.5" />}>
            View plan
          </Button>
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Recommendations                                                     */
/* ------------------------------------------------------------------ */

export function buildRecommendations(input: {
  totals: DailyTotals;
  targets: DailyTargets;
  entries: FoodLogEntry[];
  waterTotalMl: number;
  waterTargetMl: number;
  isToday: boolean;
  hasTargets: boolean;
}): string[] {
  const { totals, targets, entries, waterTotalMl, waterTargetMl, isToday, hasTargets } = input;
  const tips: string[] = [];
  const hour = new Date().getHours();

  if (!hasTargets) {
    tips.push("Calculate your nutrition targets to see how each day compares with your plan.");
  }

  const protein = remainingOf(targets.protein, totals.protein);
  if (protein.remaining !== null && protein.remaining > 0 && entries.length > 0) {
    tips.push(`You still have ${Math.round(protein.remaining)} g of your protein target remaining.`);
  } else if (protein.over !== null && protein.over > 0) {
    tips.push(`You have passed your protein target by ${Math.round(protein.over)} g.`);
  }

  const calories = remainingOf(targets.calories, totals.calories);
  if (calories.over !== null && calories.over > 0) {
    tips.push(`Today's logged calories are ${Math.round(calories.over).toLocaleString()} kcal above your target.`);
  } else if (calories.remaining !== null && entries.length > 0) {
    tips.push(`${Math.round(calories.remaining).toLocaleString()} kcal remaining for the day.`);
  }

  if (isToday) {
    const logged = new Set(entries.map((entry) => entry.mealType));
    const checks: { id: FoodLogMealType; after: number }[] = [
      { id: "breakfast", after: 10 },
      { id: "lunch", after: 14 },
      { id: "dinner", after: 21 },
    ];
    for (const check of checks) {
      if (hour >= check.after && !logged.has(check.id)) {
        tips.push(`You have not logged ${foodLogMealLabel(check.id).toLowerCase()} yet.`);
        break;
      }
    }
  }

  if (waterTotalMl > 0 && waterTotalMl < waterTargetMl) {
    tips.push(`You have logged ${formatLitres(waterTotalMl)} of your ${formatLitres(waterTargetMl)} water target.`);
  } else if (waterTotalMl >= waterTargetMl) {
    tips.push("You have reached your water target for the day.");
  } else if (isToday && hour >= 12) {
    tips.push("No water logged yet today.");
  }

  if (entries.length === 0 && isToday && tips.length === 0) {
    tips.push("Log your first meal to start tracking today.");
  }

  return tips.slice(0, 4);
}

export function RecommendationCard({ tips }: { tips: string[] }) {
  if (tips.length === 0) return null;
  return (
    <Card>
      <div className="border-b border-line bg-brand-50/60 px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
          <Lightbulb className="h-4 w-4 text-brand-400" aria-hidden="true" />
          For today
        </h2>
      </div>
      <div className="p-5">
        <ul className="space-y-2.5">
          {tips.map((tip) => (
            <li key={tip} className="flex items-start gap-2.5 text-sm leading-relaxed text-ink">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" aria-hidden="true" />
              {tip}
            </li>
          ))}
        </ul>
        <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted">
          <Droplets className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          Based only on what you have logged. General planning information, not medical advice.
        </p>
      </div>
    </Card>
  );
}
