/** Phase 5 — validation for progress entry bodies. */
import { isValidDateKey } from "@/services/foodLog/validation";
import type { ProgressWrite } from "@/services/server/progressRepository";

export const WEIGHT_MIN_KG = 20;
export const WEIGHT_MAX_KG = 400;
export const NOTE_MAX = 200;

export function parseProgressBody(body: Record<string, unknown> | null, options: { requireAll: boolean }): Partial<ProgressWrite> | { error: string } {
  if (!body) return { error: "Invalid request." };
  const out: Partial<ProgressWrite> = {};
  if (body.entryDate !== undefined || options.requireAll) {
    if (!isValidDateKey(body.entryDate)) return { error: "Choose a valid date (YYYY-MM-DD)." };
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    // Allow one day of slack for time zones; never far-future entries.
    if (body.entryDate > todayKey && body.entryDate > shift(todayKey, 1)) return { error: "The date cannot be in the future." };
    out.entryDate = body.entryDate;
  }
  if (body.weightKg !== undefined || options.requireAll) {
    const w = typeof body.weightKg === "number" ? body.weightKg : Number(body.weightKg);
    if (!Number.isFinite(w) || w <= 0) return { error: "Weight must be a number greater than 0." };
    if (w < WEIGHT_MIN_KG || w > WEIGHT_MAX_KG) return { error: `Weight must be between ${WEIGHT_MIN_KG} and ${WEIGHT_MAX_KG} kg.` };
    out.weightKg = Math.round(w * 10) / 10;
  }
  if (body.note !== undefined) {
    if (body.note === null || body.note === "") out.note = null;
    else if (typeof body.note !== "string" || body.note.length > NOTE_MAX) return { error: `Note must be ${NOTE_MAX} characters or fewer.` };
    else out.note = body.note.trim();
  }
  return out;
}

function shift(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}
