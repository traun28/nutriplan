"use client";

/**
 * Phase 3 — one meal of one day in the weekly planner.
 *
 * Pure presentation over a Part 7 `PlannedMeal`; every action is delegated
 * to MealPlanContext, which talks to the server. Nothing is recalculated
 * in the browser.
 */
import {
  ChevronDown,
  Clock,
  Loader2,
  Plus,
  RefreshCw,
  Replace,
  Timer,
  UtensilsCrossed,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { PlannedMeal } from "@/types/profile";
import type { PlannerSlot } from "@/services/diet/config";
import type { MealAlternative } from "@/services/diet/weeklyPlanner";
import { WEEKLY_SERVINGS_MAX, WEEKLY_SERVINGS_MIN } from "@/services/diet/weeklyPlanner";
import { FOOD_BY_ID } from "@/data/foods/foodDatabase";
import { allergenLabel, formatTime } from "@/data/options";
import { titleCase } from "@/lib/normalize";
import { useMealPlan, type ActionResult } from "@/context/MealPlanContext";
import { Badge, Card } from "@/components/ui/core";
import { cn } from "@/lib/cn";

const QUICK_SERVINGS = [0.5, 1, 1.5, 2];

export function WeeklyMealCard({
  meal,
  index,
  dayIndex,
  logged,
  onLog,
  onNotice,
}: {
  meal: PlannedMeal;
  index: number;
  dayIndex: number;
  /** Phase 2 log status for this slot (null when the day is not today). */
  logged: boolean | null;
  onLog?: (meal: PlannedMeal) => void;
  onNotice: (result: ActionResult) => void;
}) {
  const slot = meal.type as PlannerSlot;
  const { busy, getAlternatives, replaceMeal, regenerateMeal, updateServings } = useMealPlan();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [alternatives, setAlternatives] = useState<MealAlternative[] | null>(null);
  const [servingsDraft, setServingsDraft] = useState<Record<string, string>>({});
  const detailsId = `weekly-meal-${dayIndex}-${meal.id}`;

  const busyHere = busy !== null && busy.endsWith(`:${dayIndex}:${slot}`);
  const anyBusy = busy !== null;

  const openPicker = async () => {
    if (pickerOpen) {
      setPickerOpen(false);
      return;
    }
    setPickerOpen(true);
    if (alternatives === null) setAlternatives(await getAlternatives(dayIndex, slot));
  };

  const choose = async (foodId: string) => {
    const result = await replaceMeal(dayIndex, slot, foodId);
    onNotice(result);
    if (result.success) {
      setPickerOpen(false);
      setAlternatives(null);
    }
  };

  const regenerate = async () => {
    const result = await regenerateMeal(dayIndex, slot);
    onNotice(result);
    if (result.success) setAlternatives(null);
  };

  const applyServings = async (foodId: string, value: number) => {
    if (!Number.isFinite(value) || value < WEEKLY_SERVINGS_MIN || value > WEEKLY_SERVINGS_MAX) {
      onNotice({ success: false, message: `Servings must be between ${WEEKLY_SERVINGS_MIN} and ${WEEKLY_SERVINGS_MAX}.` });
      return;
    }
    const result = await updateServings(dayIndex, slot, foodId, value);
    onNotice(result);
    if (result.success) setServingsDraft((d) => ({ ...d, [foodId]: "" }));
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-brand-50/60 px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-brand-700 text-xs font-bold text-white">
            {String(index + 1).padStart(2, "0")}
          </span>
          <h3 className="truncate text-sm font-bold uppercase tracking-wide text-brand-300">{meal.label}</h3>
          {logged === true && <Badge tone="brand">✓ Logged</Badge>}
          {logged === false && <Badge>Not logged</Badge>}
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-1 text-xs font-semibold text-ink">
          <Clock className="h-3.5 w-3.5 text-brand-400" aria-hidden="true" />
          {formatTime(meal.time)}
        </span>
      </div>

      <div className="p-5">
        <div className="flex items-start gap-3">
          <UtensilsCrossed className="mt-0.5 h-5 w-5 shrink-0 text-brand-400" aria-hidden="true" />
          <h4 className="text-base font-bold leading-snug text-ink">{meal.name}</h4>
        </div>

        <ul className="mt-4 space-y-2">
          {meal.items.map((item) => (
            <li key={item.foodId} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line/60 pb-2 last:border-b-0 last:pb-0">
              <Link href={`/recipes/${item.foodId}`} className="rounded-sm text-sm font-semibold text-ink hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300" title="View recipe">
                {item.name}
              </Link>
              <span className="text-xs font-medium text-muted">
                {item.portionLabel} · {item.calories} kcal
              </span>
            </li>
          ))}
        </ul>

        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Chip label="Calories" value={`${meal.calories}`} unit="kcal" emphasis />
          <Chip label="Protein" value={`${Math.round(meal.proteinGrams)}`} unit="g" />
          <Chip label="Carbs" value={`${Math.round(meal.carbohydrateGrams)}`} unit="g" />
          <Chip label="Fat" value={`${Math.round(meal.fatGrams)}`} unit="g" />
        </dl>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          {meal.preparationTimeMinutes > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
              <Timer className="h-3.5 w-3.5" aria-hidden="true" />
              Preparation: {meal.preparationTimeMinutes} min
            </span>
          )}
          <div className="flex flex-wrap gap-2">
            {onLog && (
              <ActionButton onClick={() => onLog(meal)} icon={<Plus className="h-3.5 w-3.5" />} primary>
                Log this meal
              </ActionButton>
            )}
            <ActionButton onClick={() => void openPicker()} icon={<Replace className="h-3.5 w-3.5" />} expanded={pickerOpen} controls={`${detailsId}-replace`} disabled={anyBusy && !pickerOpen}>
              {pickerOpen ? "Close" : "Replace"}
            </ActionButton>
            <ActionButton onClick={() => void regenerate()} icon={busyHere ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} disabled={anyBusy}>
              Regenerate meal
            </ActionButton>
            <ActionButton onClick={() => setDetailsOpen((v) => !v)} expanded={detailsOpen} controls={detailsId} icon={<ChevronDown className={cn("h-3.5 w-3.5 transition-transform", detailsOpen && "rotate-180")} />}>
              {detailsOpen ? "Hide details" : "Details"}
            </ActionButton>
          </div>
        </div>

        {pickerOpen && (
          <div id={`${detailsId}-replace`} className="mt-4 rounded-[10px] border border-brand-400/25 bg-brand-50/40 p-3">
            <p className="text-xs font-bold text-ink">Compatible alternatives for {meal.label.toLowerCase()}</p>
            <p className="mt-0.5 text-[11px] text-muted">
              Each option passes your allergy, intolerance and dietary checks and is portioned to this meal&rsquo;s calorie budget.
            </p>
            {alternatives === null ? (
              <p className="mt-3 flex items-center gap-2 text-xs text-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Finding alternatives…
              </p>
            ) : alternatives.length === 0 ? (
              <p className="mt-3 text-xs text-muted">No other compatible option exists for this meal with your current restrictions.</p>
            ) : (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {alternatives.map((alt) => (
                  <li key={alt.foodId}>
                    <button
                      type="button"
                      onClick={() => void choose(alt.foodId)}
                      disabled={anyBusy}
                      className="flex w-full flex-col gap-1.5 rounded-[10px] border border-line bg-surface px-3 py-2.5 text-left text-xs transition-colors hover:border-brand-400 disabled:opacity-60"
                    >
                      <span className="flex w-full items-start justify-between gap-2">
                        <span className="font-semibold text-ink">{alt.name}</span>
                        {busy === `replace:${dayIndex}:${slot}` && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-brand-400" aria-hidden="true" />}
                      </span>
                      <span className="text-muted">
                        {alt.portionLabel} · {alt.calories} kcal · P {Math.round(alt.proteinGrams)} g · C {Math.round(alt.carbohydrateGrams)} g · F {Math.round(alt.fatGrams)} g
                      </span>
                      {alt.labels.length > 0 && (
                        <span className="flex flex-wrap gap-1">
                          {alt.labels.map((label) => (
                            <span key={label} className="rounded-pill border border-brand-400/25 bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-400">
                              {label}
                            </span>
                          ))}
                        </span>
                      )}
                      <span className="text-[11px] leading-snug text-muted">{alt.explanation}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {detailsOpen && (
          <div id={detailsId} className="mt-4 space-y-4 rounded-[10px] border border-line bg-canvas p-4">
            {meal.items.map((item) => {
              const food = FOOD_BY_ID.get(item.foodId);
              const draft = servingsDraft[item.foodId] ?? "";
              return (
                <div key={item.foodId} className="space-y-3">
                  <div>
                    <p className="text-sm font-bold text-ink">{item.name}</p>
                    <p className="text-xs text-muted">
                      {item.portionLabel} · {item.calories} kcal · P {Math.round(item.proteinGrams)} g · C {Math.round(item.carbohydrateGrams)} g · F {Math.round(item.fatGrams)} g
                    </p>
                  </div>
                  {food ? (
                    <dl className="grid gap-2 text-xs sm:grid-cols-2">
                      <Row label="Ingredients" value={food.ingredients.map(titleCase).join(", ") || "—"} />
                      <Row label="Allergens" value={food.allergens.length ? food.allergens.map(allergenLabel).join(", ") : "None listed"} />
                      <Row label="Tags" value={food.tags.map((t) => t.replace(/_/g, " ")).join(", ") || "—"} />
                      <Row label="Preparation" value={`${food.preparationTimeMinutes} min · ${titleCase(food.complexity)}`} />
                    </dl>
                  ) : (
                    <p className="text-xs text-muted">Food details are not available for this item.</p>
                  )}
                  <div>
                    <p className="text-[11px] font-semibold text-muted">Serving size (recalculates nutrition)</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {QUICK_SERVINGS.map((value) => (
                        <button
                          key={value}
                          type="button"
                          disabled={anyBusy || value === item.servings}
                          onClick={() => void applyServings(item.foodId, value)}
                          className={cn(
                            "rounded-pill border px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-60",
                            value === item.servings ? "border-brand-600 bg-brand-700 text-white" : "border-line bg-surface text-ink hover:border-brand-400",
                          )}
                        >
                          {value}×
                        </button>
                      ))}
                      <label className="sr-only" htmlFor={`${detailsId}-servings-${item.foodId}`}>
                        Custom servings for {item.name}
                      </label>
                      <input
                        id={`${detailsId}-servings-${item.foodId}`}
                        type="number"
                        inputMode="decimal"
                        min={WEEKLY_SERVINGS_MIN}
                        max={WEEKLY_SERVINGS_MAX}
                        step={0.25}
                        placeholder={`${item.servings}`}
                        value={draft}
                        onChange={(e) => setServingsDraft((d) => ({ ...d, [item.foodId]: e.target.value }))}
                        className="w-20 rounded-[8px] border border-line bg-surface px-2 py-1 text-xs text-ink focus:border-brand-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        disabled={anyBusy || draft.trim() === ""}
                        onClick={() => void applyServings(item.foodId, Number(draft))}
                        className="rounded-pill border border-brand-400/25 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-400 hover:bg-brand-100 disabled:opacity-60"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {meal.notes && <p className="text-xs leading-relaxed text-muted">{meal.notes}</p>}
          </div>
        )}
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold text-muted">{label}</dt>
      <dd className="text-xs text-ink">{value}</dd>
    </div>
  );
}

function Chip({ label, value, unit, emphasis }: { label: string; value: string; unit: string; emphasis?: boolean }) {
  return (
    <div className={cn("rounded-[10px] border px-3 py-2", emphasis ? "border-brand-400/25 bg-brand-50" : "border-line bg-canvas")}>
      <dt className="text-[11px] font-medium text-muted">{label}</dt>
      <dd className="text-sm font-bold text-ink">
        {value}
        <span className="ml-0.5 text-xs font-medium text-muted">{unit}</span>
      </dd>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  icon,
  disabled,
  expanded,
  controls,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
  expanded?: boolean;
  controls?: string;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-expanded={expanded}
      aria-controls={controls}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60",
        primary
          ? "border-brand-600 bg-brand-700 text-white hover:bg-brand-800"
          : "border-line bg-surface text-ink hover:border-brand-400/50 hover:text-brand-400",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
