import type { SessionUser } from "@/services/server/auth";
import type { DatasetParticipant } from "@/data/dataset/schema";

interface DevUser extends SessionUser {
  passwordHash: string;
}

const users = new Map<string, DevUser>();
const sessions = new Map<string, { userId: number; expiresAt: Date }>();
const devDatasets = new Map<number, Record<string, unknown>>();
const devDatasetRecords = new Map<number, DatasetParticipant[]>();
let nextUserId = 1;
let nextDatasetId = 1;

export function findDevUser(email: string): DevUser | undefined {
  return users.get(email);
}

export function createDevUser(
  email: string,
  fullName: string,
  passwordHash: string,
): DevUser {
  const user = { id: nextUserId++, email, fullName, passwordHash };
  users.set(email, user);
  return user;
}

export function saveDevSession(token: string, userId: number, expiresAt: Date): void {
  sessions.set(token, { userId, expiresAt });
}

export function findDevSession(token: string): { userId: number; expiresAt: Date } | undefined {
  const session = sessions.get(token);
  if (!session || session.expiresAt <= new Date()) {
    sessions.delete(token);
    return undefined;
  }
  return session;
}

export function deleteDevSession(token: string): void {
  sessions.delete(token);
}

export function findDevUserById(userId: number): DevUser | undefined {
  return [...users.values()].find((user) => user.id === userId);
}

export function createDevDataset(values: Record<string, unknown>, userId: number) {
  const id = nextDatasetId++;
  const dataset = {
    id,
    userId,
    imported: false,
    createdAt: new Date(),
    ...values,
  };
  devDatasets.set(id, dataset);
  devDatasetRecords.set(id, []);
  return dataset;
}

export function listDevDatasets(userId: number) {
  return [...devDatasets.values()]
    .filter((dataset) => dataset.userId === userId)
    .sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
}

export function getDevDataset(userId: number, id: number) {
  const dataset = devDatasets.get(id);
  return dataset?.userId === userId ? dataset : undefined;
}

export function updateDevDataset(userId: number, id: number, values: Record<string, unknown>) {
  const dataset = getDevDataset(userId, id);
  if (!dataset) return undefined;
  const updated = { ...dataset, ...values };
  devDatasets.set(id, updated);
  return updated;
}

export function deleteDevDataset(userId: number, id: number): boolean {
  const dataset = getDevDataset(userId, id);
  if (!dataset) return false;
  devDatasets.delete(id);
  devDatasetRecords.delete(id);
  return true;
}

export function saveDevDatasetRecords(id: number, records: DatasetParticipant[]): void {
  devDatasetRecords.set(id, records);
}

export function insertDevDatasetRecords(id: number, records: DatasetParticipant[]): void {
  devDatasetRecords.set(id, [...(devDatasetRecords.get(id) ?? []), ...records]);
}

export function getDevDatasetRecords(userId: number, id: number, limit: number, offset: number) {
  if (!getDevDataset(userId, id)) return { rows: [], total: 0 };
  const records = devDatasetRecords.get(id) ?? [];
  return {
    rows: records.slice(offset, offset + limit).map((data, index) => ({
      id: offset + index + 1,
      datasetId: id,
      rowIndex: offset + index + 1,
      data,
      qualityStatus: data.quality.status,
      issues: data.quality.issues,
      calories: data.nutrition.caloriesKcal,
      protein: data.nutrition.proteinG,
      age: data.age,
      heightCm: data.heightCm,
      weightKg: data.weightKg,
      activityLevel: data.activityLevelSource,
    })),
    total: records.length,
  };
}