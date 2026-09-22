/** Phase 6 — GET /api/assistant/conversations → the signed-in user's threads. */
import { currentUser, errorResponse, unauthorized } from "@/services/server/guard";
import { listConversations } from "@/services/server/aiRepository";
import { providerInfo } from "@/services/ai/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  try {
    const info = providerInfo();
    return Response.json({ conversations: await listConversations(user.id), provider: { configured: info.configured, name: info.configured ? info.name : null } });
  } catch (error) {
    return errorResponse(error, "Could not load your conversations.");
  }
}
