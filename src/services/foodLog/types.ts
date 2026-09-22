/**
 * Phase 2 — food logging types shared by the API routes, the repository
 * and the client. Nutrition figures on an entry are a snapshot taken when
 * the entry was saved (see calculations.ts), so history stays stable.
 */
import type { MealId } from "@/types/profile";

export type FoodLogMealType = MealId;

/** Meal slots offered by the logger, in day order. */
export const FOOD_LOG_MEAL_TYPES: { id: FoodLogMealType; label: string }[] = [
  { id: "breakfast", label: "Breakfast" },
  { id: "morningSnack", label: "Morning Snack" },
  { id: "lunch", label: "Lunch" },
  { id: "eveningSnack", label: "Evening Snack" },
  { id: "dinner", label: "Dinner" },
  { id: "otherSnacks", label: "Other" },
];

export const FOOD_LOG_MEAL_IDS = FOOD_LOG_MEAL_TYPES.map((meal) => meal.id);

export function foodLogMealLabel(id: string): string {
  return FOOD_LOG_MEAL_TYPES.find((meal) => meal.id === id)?.label ?? id;
}

export interface FoodLogEntry {
  id: number;
  /** "YYYY-MM-DD" (local calendar date chosen by the user). */
  logDate: string;
  mealType: FoodLogMealType;
  foodId: string;
  foodName: string;
  servings: number;
  portionLabel: string;
  calories: number;
  proteinGrams: number;
  carbohydrateGrams: number;
  fatGrams: number;
  fiberGrams: number | null;
  /** "HH:MM" or null. */
  loggedTime: string | null;
  createdAt: string;
  updatedAt: string;
}

/** What the client sends to create an entry. */
export interface FoodLogCreateInput {
  logDate: string;
  mealType: FoodLogMealType;
  foodId: string;
  servings: number;
  loggedTime?: string | null;
  /** Idempotency key generated client-side per submit. */
  clientId?: string;
}

/** Partial update; nutrition is always re-derived server-side. */
export interface FoodLogUpdateInput {
  logDate?: string;
  mealType?: FoodLogMealType;
  foodId?: string;
  servings?: number;
  loggedTime?: string | null;
}

export interface WaterEntry {
  id: number;
  logDate: string;
  amountMl: number;
  createdAt: string;
}

export interface DailyTotals {
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  /** Null when no logged entry carried a fibre value. */
  fiber: number | null;
}

export interface DailyTargets {
  calories: number | null;
  protein: number | null;
  carbohydrates: number | null;
  fat: number | null;
}

export interface FoodHistoryPage {
  entries: FoodLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}
