/**
 * Phase 6 — POST /api/assistant/chat { message, conversationId?, today?, hour? }
 * Runs the grounded assistant for the signed-in user and persists both
 * turns. The AI provider (if configured) only phrases prose; every card,
 * number and action is produced by application code.
 */
import { badRequest, currentUser, errorResponse, notFound, readJson, unauthorized } from "@/services/server/guard";
import { isValidDateKey } from "@/services/foodLog/validation";
import { toDateKey } from "@/services/foodLog/calculations";
import { checkRateLimit } from "@/services/server/rateLimit";
import { AiContext } from "@/services/ai/contextBuilder";
import { answer, titleFrom } from "@/services/ai/assistantService";
import { providerInfo } from "@/services/ai/provider";
import { appendMessages, createConversation, getConversation, MAX_MESSAGE_CHARS } from "@/services/server/aiRepository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const limit = checkRateLimit(`chat:${user.id}`);
  if (!limit.ok) {
    return Response.json({ error: `You're sending messages quickly — please wait ${limit.retryAfterSec}s and try again.` }, { status: 429, headers: { "retry-after": String(limit.retryAfterSec) } });
  }
  const body = await readJson<{ message?: unknown; conversationId?: unknown; today?: unknown; hour?: unknown }>(request);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) return badRequest("Type a message first.");
  if (message.length > MAX_MESSAGE_CHARS) return badRequest(`Messages are limited to ${MAX_MESSAGE_CHARS} characters.`);
  const today = isValidDateKey(body?.today) ? body.today : toDateKey();
  const hourRaw = Number(body?.hour);
  const hour = Number.isFinite(hourRaw) && hourRaw >= 0 && hourRaw <= 23 ? hourRaw : new Date().getHours();

  try {
    let conversationId: number | null = typeof body?.conversationId === "number" && Number.isInteger(body.conversationId) ? body.conversationId : null;
    if (conversationId !== null) {
      const owned = await getConversation(user.id, conversationId);
      if (!owned) return notFound("Conversation not found.");
    } else {
      conversationId = await createConversation(user.id, titleFrom(message));
    }

    const ctx = new AiContext(user.id, { today, hour });
    const reply = await answer(ctx, message);
    const { text, ...payload } = reply;
    const [userMsg, assistantMsg] = await appendMessages(user.id, conversationId, [
      { role: "user", content: message },
      { role: "assistant", content: text, payload },
    ]);
    return Response.json({ conversationId, messages: [userMsg, assistantMsg], provider: { configured: providerInfo().configured } });
  } catch (error) {
    return errorResponse(error, "The assistant couldn't answer right now. Everything else in NutriPlan still works — please try again shortly.");
  }
}
