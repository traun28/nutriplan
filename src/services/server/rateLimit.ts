/**
 * Phase 6 — small in-memory sliding-window limiter for AI requests.
 * Per-process only (fine for one server instance); generous enough that
 * normal chatting never hits it, strict enough to stop accidental loops.
 */
const buckets = new Map<string, number[]>();

export function checkRateLimit(key: string, limit = 20, windowMs = 60_000): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    return { ok: false, retryAfterSec: Math.ceil((windowMs - (now - recent[0])) / 1000) };
  }
  recent.push(now);
  buckets.set(key, recent);
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
  }
  return { ok: true };
}
