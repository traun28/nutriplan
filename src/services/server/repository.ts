/**
 * Part 15 — server-side data repository.
 *
 * Every row is scoped by `userId`, so one user's profile, plan, attachments
 * and datasets can never leak into another session's data. Dataset records
 * are reference data owned by a user; they are never merged into the live
 * user profile.
 */
import { and, asc, desc, eq } from "drizzle-orm";
import { db, hasDatabase } from "@/db";
import {
  attachments,
  datasetRecords,
  datasets,
  dietPlans,
  processedProfiles,
  profiles,
} from "@/db/schema";
import type {
  DietPlan,
  ProcessedProfile,
  UserProfile,
} from "@/types/profile";
import {
  createDevDataset,
  deleteDevDataset,
  getDevDataset,
  getDevDatasetRecords,
  insertDevDatasetRecords,
  listDevDatasets,
  updateDevDataset,
} from "@/services/server/devStore";

/**
 * Driver failures surface as an accurate 503 instead of being swallowed as
 * "no data" — a database outage must never look like an empty profile.
 */
export class RepositoryError extends Error {
  status: number;
  constructor(message: string, status = 503) {
    super(message);
    this.name = "RepositoryError";
    this.status = status;
  }
}

const DB_UNAVAILABLE =
  "The database is not available right now. Please try again shortly.";

async function run<T>(work: () => Promise<T>): Promise<T> {
  if (!hasDatabase) throw new RepositoryError(DB_UNAVAILABLE, 503);
  try {
    return await work();
  } catch (error) {
    if (error instanceof RepositoryError) throw error;
    throw new RepositoryError(DB_UNAVAILABLE, 503);
  }
}

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

export async function getProfile(userId: number): Promise<UserProfile | null> {
  return run(async () => {
    const rows = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1);
    return (rows[0]?.data as UserProfile) ?? null;
  });
}

export async function saveProfile(
  userId: number,
  data: UserProfile,
): Promise<boolean> {
  return run(async () => {
    const existing = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1);

    if (existing[0]) {
      await db
        .update(profiles)
        .set({ data: data as unknown as Record<string, unknown>, updatedAt: new Date() })
        .where(eq(profiles.userId, userId));
    } else {
      await db.insert(profiles).values({
        userId,
        data: data as unknown as Record<string, unknown>,
      });
    }
    return true;
  });
}

export async function deleteProfile(userId: number): Promise<boolean> {
  return run(async () => {
    await db.delete(profiles).where(eq(profiles.userId, userId));
    await db.delete(processedProfiles).where(eq(processedProfiles.userId, userId));
    await db.delete(dietPlans).where(eq(dietPlans.userId, userId));
    return true;
  });
}

/* ------------------------------------------------------------------ */
/* Processed nutrition + plan                                          */
/* ------------------------------------------------------------------ */

export async function getProcessed(userId: number): Promise<ProcessedProfile | null> {
  return run(async () => {
    const rows = await db
      .select()
      .from(processedProfiles)
      .where(eq(processedProfiles.userId, userId))
      .limit(1);
    return (rows[0]?.data as ProcessedProfile) ?? null;
  });
}

export async function saveProcessed(
  userId: number,
  data: ProcessedProfile,
): Promise<boolean> {
  return run(async () => {
    const existing = await db
      .select({ id: processedProfiles.id })
      .from(processedProfiles)
      .where(eq(processedProfiles.userId, userId))
      .limit(1);
    if (existing[0]) {
      await db
        .update(processedProfiles)
        .set({
          data: data as unknown as Record<string, unknown>,
          updatedAt: new Date(),
        })
        .where(eq(processedProfiles.userId, userId));
    } else {
      await db.insert(processedProfiles).values({
        userId,
        data: data as unknown as Record<string, unknown>,
      });
    }
    return true;
  });
}

export async function getPlan(userId: number): Promise<DietPlan | null> {
  return run(async () => {
    const rows = await db
      .select()
      .from(dietPlans)
      .where(eq(dietPlans.userId, userId))
      .limit(1);
    return (rows[0]?.data as DietPlan) ?? null;
  });
}

export async function savePlan(userId: number, data: DietPlan): Promise<boolean> {
  return run(async () => {
    const existing = await db
      .select({ id: dietPlans.id })
      .from(dietPlans)
      .where(eq(dietPlans.userId, userId))
      .limit(1);
    if (existing[0]) {
      await db
        .update(dietPlans)
        .set({ data: data as unknown as Record<string, unknown>, updatedAt: new Date() })
        .where(eq(dietPlans.userId, userId));
    } else {
      await db.insert(dietPlans).values({
        userId,
        data: data as unknown as Record<string, unknown>,
      });
    }
    return true;
  });
}

/* ------------------------------------------------------------------ */
/* Attachments                                                         */
/* ------------------------------------------------------------------ */

export async function listAttachments(userId: number) {
  return run(async () => {
    return await db
      .select()
      .from(attachments)
      .where(eq(attachments.userId, userId))
      .orderBy(desc(attachments.createdAt));
  });
}

export async function insertAttachment(
  userId: number,
  values: typeof attachments.$inferInsert,
) {
  return run(async () => {
    const rows = await db.insert(attachments).values({ ...values, userId }).returning();
    return rows[0] ?? null;
  });
}

export async function deleteAttachment(userId: number, id: number): Promise<boolean> {
  return run(async () => {
    await db.delete(attachments).where(and(eq(attachments.id, id), eq(attachments.userId, userId)));
    return true;
  });
}

/* ------------------------------------------------------------------ */
/* Datasets                                                            */
/* ------------------------------------------------------------------ */

export async function listDatasets(userId: number) {
  if (!hasDatabase) return listDevDatasets(userId);
  return run(async () => {
    return await db
      .select()
      .from(datasets)
      .where(eq(datasets.userId, userId))
      .orderBy(desc(datasets.createdAt));
  });
}

export async function createDataset(
  userId: number,
  values: Partial<typeof datasets.$inferInsert>,
) {
  if (!hasDatabase) return createDevDataset(values as Record<string, unknown>, userId);
  return run(async () => {
    const rows = await db
      .insert(datasets)
      .values({ ...values, userId } as typeof datasets.$inferInsert)
      .returning();
    return rows[0] ?? null;
  });
}

export async function updateDataset(
  userId: number,
  id: number,
  values: Partial<typeof datasets.$inferInsert>,
) {
  if (!hasDatabase) return updateDevDataset(userId, id, values as Record<string, unknown>);
  return run(async () => {
    const rows = await db
      .update(datasets)
      .set(values)
      .where(and(eq(datasets.id, id), eq(datasets.userId, userId)))
      .returning();
    return rows[0] ?? null;
  });
}

export async function getDataset(userId: number, id: number) {
  if (!hasDatabase) return getDevDataset(userId, id);
  return run(async () => {
    const rows = await db
      .select()
      .from(datasets)
      .where(and(eq(datasets.id, id), eq(datasets.userId, userId)))
      .limit(1);
    return rows[0] ?? null;
  });
}

export async function deleteDataset(userId: number, id: number): Promise<boolean> {
  if (!hasDatabase) return deleteDevDataset(userId, id);
  return run(async () => {
    const deleted = await db
      .delete(datasets)
      .where(and(eq(datasets.id, id), eq(datasets.userId, userId)))
      .returning({ id: datasets.id });
    if (deleted.length > 0) {
      await db.delete(datasetRecords).where(eq(datasetRecords.datasetId, id));
      return true;
    }
    // Nothing matched (not found, or not owned by this user) — the route
    // must report that honestly instead of claiming a delete it never made.
    return false;
  });
}

export async function insertDatasetRecords(
  datasetId: number,
  records: Array<typeof datasetRecords.$inferInsert>,
): Promise<boolean> {
  if (records.length === 0) return true;
  if (!hasDatabase) {
    insertDevDatasetRecords(
      datasetId,
      records.map((record) => record.data as unknown as import("@/data/dataset/schema").DatasetParticipant),
    );
    return true;
  }
  return run(async () => {
    // Chunked to stay well within parameter limits.
    for (let i = 0; i < records.length; i += 200) {
      await db.insert(datasetRecords).values(records.slice(i, i + 200));
    }
    return true;
  });
}

export async function getDatasetRecords(userId: number, datasetId: number, limit = 25, offset = 0) {
  if (!hasDatabase) return getDevDatasetRecords(userId, datasetId, limit, offset);
  return run(async () => {
    const owned = await getDataset(userId, datasetId);
    if (!owned) return { rows: [], total: 0 };
    const rows = await db
      .select()
      .from(datasetRecords)
      .where(eq(datasetRecords.datasetId, datasetId))
      .orderBy(asc(datasetRecords.rowIndex))
      .limit(limit)
      .offset(offset);
    return { rows, total: owned.recordCount };
  });
}
