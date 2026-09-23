/**
 * Phase 5 — progress (body-weight) entries. Every query is scoped by the
 * session user's id; ids sent by the browser are only ever combined with
 * that scope, never trusted alone.
 */
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { db, hasDatabase } from "@/db";
import { databaseFailureMessage, reportDatabaseError } from "@/services/server/databaseErrors";
import { progressEntries } from "@/db/schema";

export class ProgressRepositoryError extends Error {
  status: number;
  constructor(message: string, status = 503) {
    super(message);
    this.name = "ProgressRepositoryError";
    this.status = status;
  }
}

const DB_UNAVAILABLE = "Progress tracking is temporarily unavailable. Please try again shortly.";

function isUniqueViolation(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== "object" || depth > 3) return false;
  if ((error as { code?: unknown }).code === "23505") return true;
  return isUniqueViolation((error as { cause?: unknown }).cause, depth + 1);
}

async function run<T>(work: () => Promise<T>): Promise<T> {
  if (!hasDatabase) throw new ProgressRepositoryError(databaseFailureMessage(DB_UNAVAILABLE), 503);
  try {
    return await work();
  } catch (error) {
    if (error instanceof ProgressRepositoryError) throw error;
    if (isUniqueViolation(error)) {
      throw new ProgressRepositoryError("You already have an entry for that date. Edit it instead.", 409);
    }
    throw new ProgressRepositoryError(reportDatabaseError("progress query", error), 503);
  }
}

export interface ProgressEntry {
  id: number;
  entryDate: string;
  weightKg: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProgressWrite {
  entryDate: string;
  weightKg: number;
  note: string | null;
}

type Row = typeof progressEntries.$inferSelect;
const toEntry = (row: Row): ProgressEntry => ({
  id: row.id,
  entryDate: row.entryDate,
  weightKg: row.weightKg,
  note: row.note,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/** Newest first. */
export async function listProgress(userId: number, limit = 200): Promise<ProgressEntry[]> {
  return run(async () => {
    const rows = await db.select().from(progressEntries).where(eq(progressEntries.userId, userId)).orderBy(desc(progressEntries.entryDate)).limit(limit);
    return rows.map(toEntry);
  });
}

/** Oldest first, inclusive range. */
export async function listProgressInRange(userId: number, fromDate: string, toDate: string): Promise<ProgressEntry[]> {
  return run(async () => {
    const rows = await db
      .select()
      .from(progressEntries)
      .where(and(eq(progressEntries.userId, userId), gte(progressEntries.entryDate, fromDate), lte(progressEntries.entryDate, toDate)))
      .orderBy(asc(progressEntries.entryDate));
    return rows.map(toEntry);
  });
}

export async function createProgress(userId: number, input: ProgressWrite): Promise<ProgressEntry> {
  return run(async () => {
    const rows = await db.insert(progressEntries).values({ userId, ...input }).returning();
    if (!rows[0]) throw new ProgressRepositoryError("Could not save the entry.", 500);
    return toEntry(rows[0]);
  });
}

export async function updateProgress(userId: number, id: number, patch: Partial<ProgressWrite>): Promise<ProgressEntry | null> {
  return run(async () => {
    const rows = await db
      .update(progressEntries)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(progressEntries.id, id), eq(progressEntries.userId, userId)))
      .returning();
    return rows[0] ? toEntry(rows[0]) : null;
  });
}

export async function deleteProgress(userId: number, id: number): Promise<boolean> {
  return run(async () => {
    const rows = await db.delete(progressEntries).where(and(eq(progressEntries.id, id), eq(progressEntries.userId, userId))).returning({ id: progressEntries.id });
    return rows.length > 0;
  });
}
