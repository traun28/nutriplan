/** Phase 4 — shared validation helpers for recipe / grocery / pantry routes. */
import { GROCERY_CATEGORY_ORDER } from "@/data/recipes/ingredientCatalog";
import { isGroceryUnit, type GroceryUnit } from "@/services/grocery/units";
import { isValidDateKey } from "@/services/foodLog/validation";

export const NAME_MAX = 60;
export const NOTES_MAX = 200;
export const QTY_MAX = 100000;

export function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  return name.length > 0 && name.length <= NAME_MAX ? name : null;
}

export function parseCategory(value: unknown): string {
  return GROCERY_CATEGORY_ORDER.some((c) => c.id === value) ? (value as string) : "other";
}

/** Returns {quantity, unit} or an error string. Both may be null (unquantified). */
export function parseQuantity(qty: unknown, unit: unknown): { quantity: number | null; unit: GroceryUnit | null } | string {
  if ((qty === null || qty === undefined || qty === "") && (unit === null || unit === undefined || unit === "")) {
    return { quantity: null, unit: null };
  }
  const n = typeof qty === "number" ? qty : Number(qty);
  if (!Number.isFinite(n) || n < 0 || n > QTY_MAX) return `Quantity must be a number between 0 and ${QTY_MAX}.`;
  if (!isGroceryUnit(unit)) return "Choose a valid unit.";
  return { quantity: Math.round(n * 100) / 100, unit };
}

export function parseDate(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  return isValidDateKey(value) ? value : undefined;
}

export function parseNotes(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > NOTES_MAX) return undefined;
  return value.trim();
}
