/** Phase 6 — GET /api/assistant/recommendations?today=&hour= → a few data-backed recommendations. */
import { currentUser, errorResponse, unauthorized } from "@/services/server/guard";
import { isValidDateKey } from "@/services/foodLog/validation";
import { toDateKey } from "@/services/foodLog/calculations";
import { AiContext } from "@/services/ai/contextBuilder";
import { buildRecommendations } from "@/services/ai/recommendations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const params = new URL(request.url).searchParams;
  const today = isValidDateKey(params.get("today")) ? (params.get("today") as string) : toDateKey();
  const hourRaw = Number(params.get("hour"));
  const hour = Number.isFinite(hourRaw) && hourRaw >= 0 && hourRaw <= 23 ? hourRaw : new Date().getHours();
  try {
    const ctx = new AiContext(user.id, { today, hour });
    return Response.json({ recommendations: await buildRecommendations(ctx) });
  } catch (error) {
    return errorResponse(error, "Recommendations aren't available right now.");
  }
}
