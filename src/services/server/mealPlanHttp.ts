/** Phase 3 — small request helpers shared by the /api/meal-plans routes. */
import { BUDGET_LEVELS, type BudgetLevel } from "@/services/diet/weeklyPlanner";

export function parsePlanId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function parseBudget(value: unknown): BudgetLevel | null {
  return BUDGET_LEVELS.some((level) => level.id === value) ? (value as BudgetLevel) : null;
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}
