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
import { logDatabaseFailure } from "@/services/server/databaseErrors";
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

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

export async function getProfile(userId: number): Promise<UserProfile | null> {
  try {
    const rows = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1);
    return (rows[0]?.data as UserProfile) ?? null;
  } catch (error) {
    logDatabaseFailure("getProfile", error);
    return null;
  }
}

export async function saveProfile(
  userId: number,
  data: UserProfile,
): Promise<boolean> {
  try {
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
  } catch (error) {
    logDatabaseFailure("saveProfile", error);
    return false;
  }
}

export async function deleteProfile(userId: number): Promise<boolean> {
  try {
    await db.delete(profiles).where(eq(profiles.userId, userId));
    await db.delete(processedProfiles).where(eq(processedProfiles.userId, userId));
    await db.delete(dietPlans).where(eq(dietPlans.userId, userId));
    return true;
  } catch (error) {
    logDatabaseFailure("deleteProfile", error);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Processed nutrition + plan                                          */
/* ------------------------------------------------------------------ */

export async function getProcessed(userId: number): Promise<ProcessedProfile | null> {
  try {
    const rows = await db
      .select()
      .from(processedProfiles)
      .where(eq(processedProfiles.userId, userId))
      .limit(1);
    return (rows[0]?.data as ProcessedProfile) ?? null;
  } catch (error) {
    logDatabaseFailure("getProcessed", error);
    return null;
  }
}

export async function saveProcessed(
  userId: number,
  data: ProcessedProfile,
): Promise<boolean> {
  try {
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
  } catch (error) {
    logDatabaseFailure("saveProcessed", error);
    return false;
  }
}

export async function getPlan(userId: number): Promise<DietPlan | null> {
  try {
    const rows = await db
      .select()
      .from(dietPlans)
      .where(eq(dietPlans.userId, userId))
      .limit(1);
    return (rows[0]?.data as DietPlan) ?? null;
  } catch (error) {
    logDatabaseFailure("getPlan", error);
    return null;
  }
}

export async function savePlan(userId: number, data: DietPlan): Promise<boolean> {
  try {
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
  } catch (error) {
    logDatabaseFailure("savePlan", error);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Attachments                                                         */
/* ------------------------------------------------------------------ */

export async function listAttachments(userId: number) {
  try {
    return await db
      .select()
      .from(attachments)
      .where(eq(attachments.userId, userId))
      .orderBy(desc(attachments.createdAt));
  } catch (error) {
    logDatabaseFailure("listAttachments", error);
    return [];
  }
}

export async function insertAttachment(
  userId: number,
  values: typeof attachments.$inferInsert,
) {
  try {
    const rows = await db.insert(attachments).values({ ...values, userId }).returning();
    return rows[0] ?? null;
  } catch (error) {
    logDatabaseFailure("insertAttachment", error);
    return null;
  }
}

export async function deleteAttachment(userId: number, id: number): Promise<boolean> {
  try {
    await db.delete(attachments).where(and(eq(attachments.id, id), eq(attachments.userId, userId)));
    return true;
  } catch (error) {
    logDatabaseFailure("deleteAttachment", error);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Datasets                                                            */
/* ------------------------------------------------------------------ */

export async function listDatasets(userId: number) {
  if (!hasDatabase) return listDevDatasets(userId);
  try {
    return await db
      .select()
      .from(datasets)
      .where(eq(datasets.userId, userId))
      .orderBy(desc(datasets.createdAt));
  } catch (error) {
    logDatabaseFailure("listDatasets", error);
    return [];
  }
}

export async function createDataset(
  userId: number,
  values: Partial<typeof datasets.$inferInsert>,
) {
  if (!hasDatabase) return createDevDataset(values as Record<string, unknown>, userId);
  try {
    const rows = await db
      .insert(datasets)
      .values({ ...values, userId } as typeof datasets.$inferInsert)
      .returning();
    return rows[0] ?? null;
  } catch (error) {
    logDatabaseFailure("createDataset", error);
    return null;
  }
}

export async function updateDataset(
  userId: number,
  id: number,
  values: Partial<typeof datasets.$inferInsert>,
) {
  if (!hasDatabase) return updateDevDataset(userId, id, values as Record<string, unknown>);
  try {
    const rows = await db
      .update(datasets)
      .set(values)
      .where(and(eq(datasets.id, id), eq(datasets.userId, userId)))
      .returning();
    return rows[0] ?? null;
  } catch (error) {
    logDatabaseFailure("updateDataset", error);
    return null;
  }
}

export async function getDataset(userId: number, id: number) {
  if (!hasDatabase) return getDevDataset(userId, id);
  try {
    const rows = await db
      .select()
      .from(datasets)
      .where(and(eq(datasets.id, id), eq(datasets.userId, userId)))
      .limit(1);
    return rows[0] ?? null;
  } catch (error) {
    logDatabaseFailure("getDataset", error);
    return null;
  }
}

export async function deleteDataset(userId: number, id: number): Promise<boolean> {
  if (!hasDatabase) return deleteDevDataset(userId, id);
  try {
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
  } catch (error) {
    logDatabaseFailure("deleteDataset", error);
    return false;
  }
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
  try {
    // Chunked to stay well within parameter limits.
    for (let i = 0; i < records.length; i += 200) {
      await db.insert(datasetRecords).values(records.slice(i, i + 200));
    }
    return true;
  } catch (error) {
    logDatabaseFailure("insertDatasetRecords", error);
    return false;
  }
}

export async function getDatasetRecords(userId: number, datasetId: number, limit = 25, offset = 0) {
  if (!hasDatabase) return getDevDatasetRecords(userId, datasetId, limit, offset);
  try {
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
  } catch (error) {
    logDatabaseFailure("getDatasetRecords", error);
    return { rows: [], total: 0 };
  }
}
