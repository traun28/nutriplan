/**
 * Phase 3 — server-side repository for saved 7-day meal plans.
 *
 * Every query is scoped by the session user's id; a plan id alone is never
 * enough to read or change a row. Failures surface as `RepositoryError`
 * (503 when the database is unavailable) so routes never leak internals.
 */
import { and, desc, eq, ne } from "drizzle-orm";
import { db, hasDatabase } from "@/db";
import { mealPlans } from "@/db/schema";
import type {
  WeeklyPlanData,
  WeeklyPlanListItem,
  WeeklyPlanRecord,
} from "@/services/diet/weeklyPlanner";

export class MealPlanRepositoryError extends Error {
  status: number;
  constructor(message: string, status = 503) {
    super(message);
    this.name = "MealPlanRepositoryError";
    this.status = status;
  }
}

const DB_UNAVAILABLE = "The database is not available right now. Please try again shortly.";

async function run<T>(work: () => Promise<T>): Promise<T> {
  if (!hasDatabase) throw new MealPlanRepositoryError(DB_UNAVAILABLE, 503);
  try {
    return await work();
  } catch (error) {
    if (error instanceof MealPlanRepositoryError) throw error;
    throw new MealPlanRepositoryError(DB_UNAVAILABLE, 503);
  }
}

type Row = typeof mealPlans.$inferSelect;

function toRecord(row: Row): WeeklyPlanRecord {
  return {
    id: row.id,
    name: row.name,
    startDate: row.startDate,
    isCurrent: row.isCurrent,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    data: row.data as WeeklyPlanData,
  };
}

function toListItem(row: Row): WeeklyPlanListItem {
  const data = row.data as WeeklyPlanData;
  return {
    id: row.id,
    name: row.name,
    startDate: row.startDate,
    isCurrent: row.isCurrent,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    summary: data.summary,
  };
}

export const MAX_PLAN_NAME = 80;

export function cleanPlanName(value: unknown, fallback = "My Weekly Plan"): string {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return (name || fallback).slice(0, MAX_PLAN_NAME);
}

export async function listMealPlans(userId: number): Promise<WeeklyPlanListItem[]> {
  return run(async () => {
    const rows = await db
      .select()
      .from(mealPlans)
      .where(eq(mealPlans.userId, userId))
      .orderBy(desc(mealPlans.isCurrent), desc(mealPlans.createdAt));
    return rows.map(toListItem);
  });
}

export async function getMealPlan(userId: number, id: number): Promise<WeeklyPlanRecord | null> {
  return run(async () => {
    const rows = await db
      .select()
      .from(mealPlans)
      .where(and(eq(mealPlans.id, id), eq(mealPlans.userId, userId)))
      .limit(1);
    return rows[0] ? toRecord(rows[0]) : null;
  });
}

export async function getCurrentMealPlan(userId: number): Promise<WeeklyPlanRecord | null> {
  return run(async () => {
    const rows = await db
      .select()
      .from(mealPlans)
      .where(and(eq(mealPlans.userId, userId), eq(mealPlans.isCurrent, true)))
      .orderBy(desc(mealPlans.updatedAt))
      .limit(1);
    return rows[0] ? toRecord(rows[0]) : null;
  });
}

export async function createMealPlan(
  userId: number,
  input: { name: string; startDate: string | null; data: WeeklyPlanData; makeCurrent: boolean },
): Promise<WeeklyPlanRecord> {
  return run(async () => {
    if (input.makeCurrent) {
      await db.update(mealPlans).set({ isCurrent: false }).where(eq(mealPlans.userId, userId));
    }
    const rows = await db
      .insert(mealPlans)
      .values({
        userId,
        name: input.name,
        startDate: input.startDate,
        isCurrent: input.makeCurrent,
        data: input.data as unknown as Record<string, unknown>,
      })
      .returning();
    return toRecord(rows[0]);
  });
}

export async function updateMealPlan(
  userId: number,
  id: number,
  patch: { name?: string; startDate?: string | null; data?: WeeklyPlanData; isCurrent?: boolean },
): Promise<WeeklyPlanRecord | null> {
  return run(async () => {
    const values: Partial<typeof mealPlans.$inferInsert> = { updatedAt: new Date() };
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.startDate !== undefined) values.startDate = patch.startDate;
    if (patch.data !== undefined) values.data = patch.data as unknown as Record<string, unknown>;
    if (patch.isCurrent !== undefined) values.isCurrent = patch.isCurrent;

    if (patch.isCurrent === true) {
      await db
        .update(mealPlans)
        .set({ isCurrent: false })
        .where(and(eq(mealPlans.userId, userId), ne(mealPlans.id, id)));
    }
    const rows = await db
      .update(mealPlans)
      .set(values)
      .where(and(eq(mealPlans.id, id), eq(mealPlans.userId, userId)))
      .returning();
    return rows[0] ? toRecord(rows[0]) : null;
  });
}

export async function deleteMealPlan(userId: number, id: number): Promise<boolean> {
  return run(async () => {
    const rows = await db
      .delete(mealPlans)
      .where(and(eq(mealPlans.id, id), eq(mealPlans.userId, userId)))
      .returning({ id: mealPlans.id });
    return rows.length > 0;
  });
}
