"use client";

/**
 * Part 8 — one meal in the generated plan.
 *
 * Pure presentation: every number comes from the PlannedMeal produced by
 * the Part 7 engine. Nothing is recalculated here.
 */
import { ChevronDown, Clock, Loader2, RefreshCw, Timer, UtensilsCrossed } from "lucide-react";
import { useState } from "react";
import type { FoodItemRecord, PlannedMeal } from "@/types/profile";
import { useDietPlan } from "@/context/DietPlanContext";
import { formatTime } from "@/data/options";
import { titleCase } from "@/lib/normalize";
import { Card } from "@/components/ui/core";
import { cn } from "@/lib/cn";

export function MealCard({
  meal,
  index,
}: {
  meal: PlannedMeal;
  index: number;
}) {
  const [open, setOpen] = useState(false);
  const detailsId = `meal-details-${meal.id}`;

  // Replace-meal picker: alternatives are loaded on demand and filtered
  // through the same restriction rules as generation.
  const { replaceMeal, getAlternatives } = useDietPlan();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [alternatives, setAlternatives] = useState<FoodItemRecord[] | null>(null);
  const [busyFoodId, setBusyFoodId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const openPicker = async () => {
    setFeedback(null);
    if (pickerOpen) {
      setPickerOpen(false);
      return;
    }
    setPickerOpen(true);
    if (alternatives === null) {
      setAlternatives(await getAlternatives(meal.type));
    }
  };

  const choose = async (foodId: string) => {
    if (busyFoodId) return; // duplicate-click guard
    setBusyFoodId(foodId);
    const result = await replaceMeal(meal.type, foodId);
    setBusyFoodId(null);
    setFeedback(result.message);
    if (result.success) {
      setPickerOpen(false);
      setAlternatives(null);
    }
  };

  return (
    <Card className="overflow-hidden break-inside-avoid">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-brand-50/60 px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-brand-700 text-xs font-bold text-white"
          >
            {String(index + 1).padStart(2, "0")}
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold uppercase tracking-wide text-brand-400">
              {meal.label}
            </h3>
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-1 text-xs font-semibold text-ink">
          <Clock className="h-3.5 w-3.5 text-brand-400" aria-hidden="true" />
          {formatTime(meal.time)}
        </span>
      </div>

      <div className="p-5">
        <div className="flex items-start gap-3">
          <UtensilsCrossed
            className="mt-0.5 h-5 w-5 shrink-0 text-brand-400"
            aria-hidden="true"
          />
          <h4 className="text-base font-bold leading-snug text-ink">
            {meal.name}
          </h4>
        </div>

        {/* Food items with human-readable portions */}
        <ul className="mt-4 space-y-2">
          {meal.items.map((item) => (
            <li
              key={item.foodId}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line/60 pb-2 last:border-b-0 last:pb-0"
            >
              <span className="text-sm font-semibold text-ink">{item.name}</span>
              <span className="text-xs font-medium text-muted">
                {item.portionLabel} · {item.calories} kcal
              </span>
            </li>
          ))}
        </ul>

        {/* Meal nutrition line */}
        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <NutrientChip label="Calories" value={`${meal.calories}`} unit="kcal" emphasis />
          <NutrientChip label="Protein" value={`${Math.round(meal.proteinGrams)}`} unit="g" />
          <NutrientChip label="Carbs" value={`${Math.round(meal.carbohydrateGrams)}`} unit="g" />
          <NutrientChip label="Fat" value={`${Math.round(meal.fatGrams)}`} unit="g" />
        </dl>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          {meal.preparationTimeMinutes > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
              <Timer className="h-3.5 w-3.5" aria-hidden="true" />
              Preparation: {meal.preparationTimeMinutes} min
            </span>
          )}
          <div className="flex flex-wrap gap-2 print:hidden">
            {meal.type !== "otherSnacks" && (
              <button
                type="button"
                onClick={() => void openPicker()}
                aria-expanded={pickerOpen}
                aria-controls={`${detailsId}-replace`}
                className="inline-flex items-center gap-1.5 rounded-pill border border-brand-400/25 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-400 transition-colors hover:bg-brand-100"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                {pickerOpen ? "Close" : "Replace"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              aria-controls={detailsId}
              className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-brand-400/50 hover:text-brand-400"
            >
              {open ? "Hide details" : "Why this meal?"}
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform duration-200",
                  open && "rotate-180",
                )}
                aria-hidden="true"
              />
            </button>
          </div>
        </div>

        {pickerOpen && (
          <div
            id={`${detailsId}-replace`}
            className="mt-4 rounded-[10px] border border-brand-400/25 bg-brand-50/40 p-3 print:hidden"
          >
            <p className="text-xs font-bold text-ink">
              Safe alternatives for {meal.label.toLowerCase()}
            </p>
            <p className="mt-0.5 text-[11px] text-muted">
              Each option already passes your allergy, intolerance and dietary checks.
            </p>
            {alternatives === null ? (
              <p className="mt-3 flex items-center gap-2 text-xs text-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Finding alternatives…
              </p>
            ) : alternatives.length === 0 ? (
              <p className="mt-3 text-xs text-muted">
                No other compatible options for this slot with your current restrictions.
              </p>
            ) : (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {alternatives.map((food) => (
                  <li key={food.id}>
                    <button
                      type="button"
                      onClick={() => void choose(food.id)}
                      disabled={busyFoodId !== null}
                      className="flex w-full items-center justify-between gap-2 rounded-[10px] border border-line bg-surface px-3 py-2 text-left text-xs transition-colors hover:border-brand-400 disabled:opacity-60"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-ink">{food.name}</span>
                        <span className="text-muted">
                          {food.calories} kcal · {Math.round(food.proteinGrams)}g protein · {food.preparationTimeMinutes} min
                        </span>
                      </span>
                      {busyFoodId === food.id && (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-brand-400" aria-hidden="true" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {feedback && (
          <p role="status" className="mt-3 rounded-[10px] bg-canvas p-2.5 text-xs text-ink">
            {feedback}
          </p>
        )}

        {open && (
          <div id={detailsId} className="mt-4 space-y-3 border-t border-line pt-4">
            <p className="text-xs leading-relaxed text-muted">
              Chosen for your {meal.label.toLowerCase()} slot because it fits about{" "}
              {Math.round(meal.targetShare * 100)}% of your daily calorie target
              ({meal.calories} kcal), supplies {Math.round(meal.proteinGrams)}g protein, and
              passed every allergy, intolerance and dietary-pattern check.
            </p>
            {meal.items.map((item) => (
              <div key={`${item.foodId}-ing`}>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-400">
                  {item.name} — ingredients
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {item.ingredients.map(titleCase).join(", ")}
                </p>
              </div>
            ))}
          </div>
        )}

        {meal.notes.trim() && (
          <p className="mt-4 rounded-[10px] bg-canvas p-3 text-xs leading-relaxed text-muted">
            {meal.notes}
          </p>
        )}
      </div>
    </Card>
  );
}

function NutrientChip({
  label,
  value,
  unit,
  emphasis,
}: {
  label: string;
  value: string;
  unit: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[10px] border px-3 py-2",
        emphasis ? "border-brand-400/25 bg-brand-50" : "border-line bg-canvas",
      )}
    >
      <dt className="text-[11px] font-medium text-muted">{label}</dt>
      <dd className="text-sm font-bold text-ink">
        {value}
        <span className="ml-0.5 text-xs font-medium text-muted">{unit}</span>
      </dd>
    </div>
  );
}
