/**
 * Phase 5 — GET /api/progress (history + body metrics) · POST /api/progress
 * { entryDate, weightKg, note? }. One entry per user per date.
 */
import { currentUser, errorResponse, readJson, unauthorized } from "@/services/server/guard";
import { createProgress, listProgress } from "@/services/server/progressRepository";
import { getProfile } from "@/services/server/repository";
import { bodyMetrics } from "@/services/server/analyticsService";
import { parseProgressBody } from "@/services/server/progressHttp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  try {
    const [entries, profile] = await Promise.all([listProgress(user.id), getProfile(user.id)]);
    return Response.json({ entries, metrics: bodyMetrics(profile, entries[0]?.weightKg ?? null) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const body = await readJson<Record<string, unknown>>(request);
  const parsed = parseProgressBody(body, { requireAll: true });
  if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });
  try {
    const entry = await createProgress(user.id, { entryDate: parsed.entryDate!, weightKg: parsed.weightKg!, note: parsed.note ?? null });
    return Response.json({ entry }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
