/**
 * Phase 2 — validation shared by the client form and the API routes.
 * Returns readable messages; never throws.
 */
import { FOOD_LOG_MEAL_IDS, type FoodLogCreateInput, type FoodLogUpdateInput } from "@/services/foodLog/types";
import { findFood } from "@/services/foodLog/calculations";

export const SERVINGS_MIN = 0.1;
export const SERVINGS_MAX = 20;
export const WATER_MIN_ML = 10;
export const WATER_MAX_ML = 5000;
export const WATER_TARGET_MIN_ML = 250;
export const WATER_TARGET_MAX_ML = 10000;

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

export function isValidTimeKey(value: unknown): value is string {
  return typeof value === "string" && TIME_RE.test(value);
}

export function isValidMealType(value: unknown): boolean {
  return typeof value === "string" && (FOOD_LOG_MEAL_IDS as string[]).includes(value);
}

export function validateServings(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Enter a quantity.";
  if (value <= 0) return "Quantity must be greater than zero.";
  if (value < SERVINGS_MIN) return `Quantity must be at least ${SERVINGS_MIN}.`;
  if (value > SERVINGS_MAX) return `Quantity cannot exceed ${SERVINGS_MAX} servings.`;
  return null;
}

export type FieldErrors = Partial<Record<"logDate" | "mealType" | "foodId" | "servings" | "loggedTime", string>>;

export function validateCreate(input: Partial<FoodLogCreateInput> | null | undefined): FieldErrors {
  const errors: FieldErrors = {};
  if (!input || typeof input !== "object") return { foodId: "Invalid request." };
  if (!isValidDateKey(input.logDate)) errors.logDate = "Choose a valid date.";
  if (!isValidMealType(input.mealType)) errors.mealType = "Choose a meal type.";
  if (typeof input.foodId !== "string" || !input.foodId) errors.foodId = "Select a food.";
  else if (!findFood(input.foodId)) errors.foodId = "That food could not be found.";
  const servingsError = validateServings(input.servings);
  if (servingsError) errors.servings = servingsError;
  if (input.loggedTime !== undefined && input.loggedTime !== null && input.loggedTime !== "" && !isValidTimeKey(input.loggedTime)) {
    errors.loggedTime = "Enter a valid time.";
  }
  return errors;
}

export function validateUpdate(input: FoodLogUpdateInput | null | undefined): FieldErrors {
  const errors: FieldErrors = {};
  if (!input || typeof input !== "object") return { foodId: "Invalid request." };
  if (input.logDate !== undefined && !isValidDateKey(input.logDate)) errors.logDate = "Choose a valid date.";
  if (input.mealType !== undefined && !isValidMealType(input.mealType)) errors.mealType = "Choose a meal type.";
  if (input.foodId !== undefined) {
    if (typeof input.foodId !== "string" || !findFood(input.foodId)) errors.foodId = "That food could not be found.";
  }
  if (input.servings !== undefined) {
    const servingsError = validateServings(input.servings);
    if (servingsError) errors.servings = servingsError;
  }
  if (input.loggedTime !== undefined && input.loggedTime !== null && input.loggedTime !== "" && !isValidTimeKey(input.loggedTime)) {
    errors.loggedTime = "Enter a valid time.";
  }
  return errors;
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function firstError(errors: FieldErrors): string {
  return Object.values(errors)[0] ?? "Invalid request.";
}

export function validateWaterAmount(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) return "Enter an amount in millilitres.";
  if (value < WATER_MIN_ML) return `Amount must be at least ${WATER_MIN_ML} ml.`;
  if (value > WATER_MAX_ML) return `Amount cannot exceed ${WATER_MAX_ML} ml per entry.`;
  return null;
}

export function validateWaterTarget(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) return "Enter a target in millilitres.";
  if (value < WATER_TARGET_MIN_ML || value > WATER_TARGET_MAX_ML) {
    return `Target must be between ${WATER_TARGET_MIN_ML} and ${WATER_TARGET_MAX_ML} ml.`;
  }
  return null;
}
