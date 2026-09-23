/**
 * Phase 2 — server-side repository for food logs, favourites, water and
 * per-user settings.
 *
 * Every query is scoped by `userId` (taken from the session, never from
 * the client), so one user can never read, edit or delete another's rows.
 * Functions throw `RepositoryError` with a safe message; routes translate
 * that into a status code without leaking internals.
 */
import { and, asc, count, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db, hasDatabase } from "@/db";
import { databaseFailureMessage, reportDatabaseError } from "@/services/server/databaseErrors";
import { foodFavorites, foodLogs, userSettings, waterLogs } from "@/db/schema";
import type {
  FoodLogEntry,
  FoodLogMealType,
  WaterEntry,
} from "@/services/foodLog/types";
import type { ScaledNutrition } from "@/services/foodLog/calculations";

export class RepositoryError extends Error {
  status: number;
  constructor(message: string, status = 503) {
    super(message);
    this.name = "RepositoryError";
    this.status = status;
  }
}

const DB_UNAVAILABLE = "The database is not available right now. Please try again shortly.";

function requireDatabase(): void {
  if (!hasDatabase) throw new RepositoryError(databaseFailureMessage(DB_UNAVAILABLE), 503);
}

/** Wraps a query so driver failures become a safe 503 (never a stack trace). */
async function run<T>(work: () => Promise<T>): Promise<T> {
  requireDatabase();
  try {
    return await work();
  } catch (error) {
    if (error instanceof RepositoryError) throw error;
    throw new RepositoryError(reportDatabaseError("food log query", error), 503);
  }
}

type FoodLogRow = typeof foodLogs.$inferSelect;

function toEntry(row: FoodLogRow): FoodLogEntry {
  return {
    id: row.id,
    logDate: row.logDate,
    mealType: row.mealType as FoodLogMealType,
    foodId: row.foodId,
    foodName: row.foodName,
    servings: row.servings,
    portionLabel: row.portionLabel,
    calories: row.calories,
    proteinGrams: row.proteinGrams,
    carbohydrateGrams: row.carbohydrateGrams,
    fatGrams: row.fatGrams,
    fiberGrams: row.fiberGrams ?? null,
    loggedTime: row.loggedTime ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* Food logs                                                           */
/* ------------------------------------------------------------------ */

export interface FoodLogWrite {
  logDate: string;
  mealType: FoodLogMealType;
  loggedTime: string | null;
  nutrition: ScaledNutrition;
  clientId?: string | null;
}

export async function listFoodLogsForDate(userId: number, logDate: string): Promise<FoodLogEntry[]> {
  return run(async () => {
    const rows = await db
      .select()
      .from(foodLogs)
      .where(and(eq(foodLogs.userId, userId), eq(foodLogs.logDate, logDate)))
      .orderBy(asc(foodLogs.loggedTime), asc(foodLogs.createdAt));
    return rows.map(toEntry);
  });
}

export async function getFoodLog(userId: number, id: number): Promise<FoodLogEntry | null> {
  return run(async () => {
    const rows = await db
      .select()
      .from(foodLogs)
      .where(and(eq(foodLogs.id, id), eq(foodLogs.userId, userId)))
      .limit(1);
    return rows[0] ? toEntry(rows[0]) : null;
  });
}

/**
 * Inserts an entry. When `clientId` was already used by this user the
 * existing row is returned instead (double-click / retry safe).
 */
export async function createFoodLog(userId: number, input: FoodLogWrite): Promise<{ entry: FoodLogEntry; created: boolean }> {
  return run(async () => {
    if (input.clientId) {
      const existing = await db
        .select()
        .from(foodLogs)
        .where(and(eq(foodLogs.userId, userId), eq(foodLogs.clientId, input.clientId)))
        .limit(1);
      if (existing[0]) return { entry: toEntry(existing[0]), created: false };
    }
    const n = input.nutrition;
    const rows = await db
      .insert(foodLogs)
      .values({
        userId,
        logDate: input.logDate,
        mealType: input.mealType,
        foodId: n.foodId,
        foodName: n.foodName,
        servings: n.servings,
        portionLabel: n.portionLabel,
        calories: n.calories,
        proteinGrams: n.proteinGrams,
        carbohydrateGrams: n.carbohydrateGrams,
        fatGrams: n.fatGrams,
        fiberGrams: n.fiberGrams,
        loggedTime: input.loggedTime,
        clientId: input.clientId ?? null,
      })
      .onConflictDoNothing()
      .returning();
    if (rows[0]) return { entry: toEntry(rows[0]), created: true };
    // Lost a race on the idempotency key — return the winner.
    if (input.clientId) {
      const winner = await db
        .select()
        .from(foodLogs)
        .where(and(eq(foodLogs.userId, userId), eq(foodLogs.clientId, input.clientId)))
        .limit(1);
      if (winner[0]) return { entry: toEntry(winner[0]), created: false };
    }
    throw new RepositoryError("Could not save the food entry.", 500);
  });
}

export async function updateFoodLog(userId: number, id: number, input: FoodLogWrite): Promise<FoodLogEntry | null> {
  return run(async () => {
    const n = input.nutrition;
    const rows = await db
      .update(foodLogs)
      .set({
        logDate: input.logDate,
        mealType: input.mealType,
        foodId: n.foodId,
        foodName: n.foodName,
        servings: n.servings,
        portionLabel: n.portionLabel,
        calories: n.calories,
        proteinGrams: n.proteinGrams,
        carbohydrateGrams: n.carbohydrateGrams,
        fatGrams: n.fatGrams,
        fiberGrams: n.fiberGrams,
        loggedTime: input.loggedTime,
        updatedAt: new Date(),
      })
      .where(and(eq(foodLogs.id, id), eq(foodLogs.userId, userId)))
      .returning();
    return rows[0] ? toEntry(rows[0]) : null;
  });
}

/** Returns false when nothing owned by this user matched (→ 404). */
export async function deleteFoodLog(userId: number, id: number): Promise<boolean> {
  return run(async () => {
    const rows = await db
      .delete(foodLogs)
      .where(and(eq(foodLogs.id, id), eq(foodLogs.userId, userId)))
      .returning({ id: foodLogs.id });
    return rows.length > 0;
  });
}

export async function listFoodHistory(
  userId: number,
  page: number,
  pageSize: number,
): Promise<{ entries: FoodLogEntry[]; total: number }> {
  return run(async () => {
    const offset = (page - 1) * pageSize;
    const [rows, totals] = await Promise.all([
      db
        .select()
        .from(foodLogs)
        .where(eq(foodLogs.userId, userId))
        .orderBy(desc(foodLogs.logDate), desc(foodLogs.loggedTime), desc(foodLogs.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ value: count() }).from(foodLogs).where(eq(foodLogs.userId, userId)),
    ]);
    return { entries: rows.map(toEntry), total: Number(totals[0]?.value ?? 0) };
  });
}

/** Distinct food ids most recently logged by this user (newest first). */
export async function listRecentFoodIds(userId: number, limit = 12): Promise<string[]> {
  return run(async () => {
    const rows = await db
      .select({
        foodId: foodLogs.foodId,
        last: sql<string>`max(${foodLogs.createdAt})`.as("last"),
      })
      .from(foodLogs)
      .where(eq(foodLogs.userId, userId))
      .groupBy(foodLogs.foodId)
      .orderBy(desc(sql`max(${foodLogs.createdAt})`))
      .limit(limit);
    return rows.map((row) => row.foodId);
  });
}

/* ------------------------------------------------------------------ */
/* Favourites                                                          */
/* ------------------------------------------------------------------ */

export async function listFavoriteFoodIds(userId: number): Promise<string[]> {
  return run(async () => {
    const rows = await db
      .select({ foodId: foodFavorites.foodId })
      .from(foodFavorites)
      .where(eq(foodFavorites.userId, userId))
      .orderBy(desc(foodFavorites.createdAt));
    return rows.map((row) => row.foodId);
  });
}

export async function addFavorite(userId: number, foodId: string): Promise<void> {
  return run(async () => {
    await db.insert(foodFavorites).values({ userId, foodId }).onConflictDoNothing();
  });
}

export async function removeFavorite(userId: number, foodId: string): Promise<boolean> {
  return run(async () => {
    const rows = await db
      .delete(foodFavorites)
      .where(and(eq(foodFavorites.userId, userId), eq(foodFavorites.foodId, foodId)))
      .returning({ id: foodFavorites.id });
    return rows.length > 0;
  });
}

/* ------------------------------------------------------------------ */
/* Water                                                               */
/* ------------------------------------------------------------------ */

type WaterRow = typeof waterLogs.$inferSelect;

function toWater(row: WaterRow): WaterEntry {
  return {
    id: row.id,
    logDate: row.logDate,
    amountMl: row.amountMl,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listWaterForDate(userId: number, logDate: string): Promise<WaterEntry[]> {
  return run(async () => {
    const rows = await db
      .select()
      .from(waterLogs)
      .where(and(eq(waterLogs.userId, userId), eq(waterLogs.logDate, logDate)))
      .orderBy(asc(waterLogs.createdAt));
    return rows.map(toWater);
  });
}

export async function addWater(userId: number, logDate: string, amountMl: number): Promise<WaterEntry> {
  return run(async () => {
    const rows = await db.insert(waterLogs).values({ userId, logDate, amountMl }).returning();
    if (!rows[0]) throw new RepositoryError("Could not save the water entry.", 500);
    return toWater(rows[0]);
  });
}

export async function updateWater(userId: number, id: number, amountMl: number): Promise<WaterEntry | null> {
  return run(async () => {
    const rows = await db
      .update(waterLogs)
      .set({ amountMl })
      .where(and(eq(waterLogs.id, id), eq(waterLogs.userId, userId)))
      .returning();
    return rows[0] ? toWater(rows[0]) : null;
  });
}

export async function deleteWater(userId: number, id: number): Promise<boolean> {
  return run(async () => {
    const rows = await db
      .delete(waterLogs)
      .where(and(eq(waterLogs.id, id), eq(waterLogs.userId, userId)))
      .returning({ id: waterLogs.id });
    return rows.length > 0;
  });
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export interface UserSettingsData {
  waterTargetMl?: number;
}

export async function getSettings(userId: number): Promise<UserSettingsData> {
  return run(async () => {
    const rows = await db
      .select({ data: userSettings.data })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);
    return rows[0]?.data ?? {};
  });
}

export async function saveSettings(userId: number, patch: UserSettingsData): Promise<UserSettingsData> {
  return run(async () => {
    const current = await getSettings(userId);
    const next = { ...current, ...patch };
    await db
      .insert(userSettings)
      .values({ userId, data: next })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: { data: next, updatedAt: new Date() },
      });
    return next;
  });
}

/** Used by tests/tools: bulk delete helper kept user-scoped. */
export async function deleteFoodLogsByIds(userId: number, ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  return run(async () => {
    const rows = await db
      .delete(foodLogs)
      .where(and(eq(foodLogs.userId, userId), inArray(foodLogs.id, ids)))
      .returning({ id: foodLogs.id });
    return rows.length;
  });
}

/* ------------------------------------------------------------------ */
/* Phase 5 — range reads for analytics (inclusive date keys)           */
/* ------------------------------------------------------------------ */

export async function listFoodLogsInRange(userId: number, fromDate: string, toDate: string): Promise<FoodLogEntry[]> {
  return run(async () => {
    const rows = await db
      .select()
      .from(foodLogs)
      .where(and(eq(foodLogs.userId, userId), gte(foodLogs.logDate, fromDate), lte(foodLogs.logDate, toDate)))
      .orderBy(asc(foodLogs.logDate), asc(foodLogs.loggedTime), asc(foodLogs.createdAt));
    return rows.map(toEntry);
  });
}

export async function listWaterInRange(userId: number, fromDate: string, toDate: string): Promise<WaterEntry[]> {
  return run(async () => {
    const rows = await db
      .select()
      .from(waterLogs)
      .where(and(eq(waterLogs.userId, userId), gte(waterLogs.logDate, fromDate), lte(waterLogs.logDate, toDate)))
      .orderBy(asc(waterLogs.logDate), asc(waterLogs.createdAt));
    return rows.map(toWater);
  });
}
