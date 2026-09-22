/**
 * Phase 7 — tiny in-process TTL cache for dataset aggregates. Keys include the
 * user id, so cached results can never be served across accounts. Entries are
 * short-lived (20 s) and invalidated on record edits via `statsCache.bust()`.
 */
const TTL_MS = 20_000;
const MAX_ENTRIES = 200;
const store = new Map<string, { expires: number; value: unknown }>();

export const statsCache = {
  async get<T>(key: string, compute: () => Promise<T>): Promise<T> {
    const hit = store.get(key);
    const now = Date.now();
    if (hit && hit.expires > now) return hit.value as T;
    const value = await compute();
    if (store.size >= MAX_ENTRIES) {
      const oldest = store.keys().next().value;
      if (oldest !== undefined) store.delete(oldest);
    }
    store.set(key, { expires: now + TTL_MS, value });
    return value;
  },
  /** Drops every entry for one dataset (prefix `${userId}:${datasetId}:`). */
  bust(userId: number, datasetId: number): void {
    const prefix = `${userId}:${datasetId}:`;
    for (const key of [...store.keys()]) if (key.startsWith(prefix)) store.delete(key);
  },
};
