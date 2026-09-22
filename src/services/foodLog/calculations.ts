/**
 * Phase 2 — the ONE place that turns a food + quantity into nutrition and
 * sums a day. Used by the API (when saving), the logger preview and the
 * dashboard, so every screen agrees to the gram.
 *
 * Scaling delegates to the Part 7 `buildPlannedItem` helper so logged food
 * and planned food are computed identically.
 */
import type { FoodItemRecord } from "@/types/profile";
import { FOOD_BY_ID } from "@/data/foods/foodDatabase";
import { buildPlannedItem } from "@/services/diet/dietGenerator";
import { roundTo } from "@/lib/numbers";
import type { DailyTargets, DailyTotals, FoodLogEntry } from "@/services/foodLog/types";

export interface ScaledNutrition {
  foodId: string;
  foodName: string;
  servings: number;
  portionLabel: string;
  calories: number;
  proteinGrams: number;
  carbohydrateGrams: number;
  fatGrams: number;
  /** The dataset carries no fibre figure today; kept nullable for later. */
  fiberGrams: number | null;
}

export function findFood(foodId: string): FoodItemRecord | undefined {
  return FOOD_BY_ID.get(foodId);
}

/** Nutrition for `servings` × the food's reference serving. */
export function scaleFood(food: FoodItemRecord, servings: number): ScaledNutrition {
  const item = buildPlannedItem(food, servings);
  return {
    foodId: food.id,
    foodName: food.name,
    servings,
    portionLabel: item.portionLabel,
    calories: item.calories,
    proteinGrams: item.proteinGrams,
    carbohydrateGrams: item.carbohydrateGrams,
    fatGrams: item.fatGrams,
    fiberGrams: null,
  };
}

/** Sums logged entries into daily totals (fibre only when any entry has it). */
export function sumEntries(entries: Pick<FoodLogEntry, "calories" | "proteinGrams" | "carbohydrateGrams" | "fatGrams" | "fiberGrams">[]): DailyTotals {
  let calories = 0;
  let protein = 0;
  let carbohydrates = 0;
  let fat = 0;
  let fiber: number | null = null;
  for (const entry of entries) {
    calories += entry.calories;
    protein += entry.proteinGrams;
    carbohydrates += entry.carbohydrateGrams;
    fat += entry.fatGrams;
    if (entry.fiberGrams !== null && entry.fiberGrams !== undefined) {
      fiber = (fiber ?? 0) + entry.fiberGrams;
    }
  }
  return {
    calories: Math.round(calories),
    protein: roundTo(protein, 1),
    carbohydrates: roundTo(carbohydrates, 1),
    fat: roundTo(fat, 1),
    fiber: fiber === null ? null : roundTo(fiber, 1),
  };
}

/** Remaining amount (never below zero) and the overshoot if any. */
export function remainingOf(target: number | null, consumed: number) {
  if (target === null || !Number.isFinite(target)) {
    return { remaining: null, over: null, percent: null };
  }
  const diff = roundTo(target - consumed, 1);
  return {
    remaining: Math.max(0, diff),
    over: diff < 0 ? Math.abs(diff) : 0,
    percent: target > 0 ? Math.round((consumed / target) * 100) : null,
  };
}

/** Picks the daily targets out of the Part 6 processed profile. */
export function targetsFromProcessed(
  processed: {
    energy: { selectedCalories: number | null };
    macronutrients: {
      protein: { selectedGrams: number | null };
      carbohydrates: { grams: number | null };
      fat: { grams: number | null };
    };
  } | null,
): DailyTargets {
  if (!processed) return { calories: null, protein: null, carbohydrates: null, fat: null };
  return {
    calories: processed.energy.selectedCalories,
    protein: processed.macronutrients.protein.selectedGrams,
    carbohydrates: processed.macronutrients.carbohydrates.grams,
    fat: processed.macronutrients.fat.grams,
  };
}

/** Local calendar date as "YYYY-MM-DD". */
export function toDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function shiftDateKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

/** Current local time as "HH:MM". */
export function nowTimeKey(date: Date = new Date()): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
