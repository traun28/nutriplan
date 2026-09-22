/**
 * Phase 6 — persistence for assistant conversations. Every query is scoped
 * by the session user's id, so conversations are never global.
 */
import { and, asc, count, desc, eq } from "drizzle-orm";
import { db, hasDatabase } from "@/db";
import { aiConversations, aiMessages } from "@/db/schema";
import type { AssistantMessageRecord, AssistantReply, ConversationSummary } from "@/services/ai/types";

export class AiRepositoryError extends Error {
  status: number;
  constructor(message: string, status = 503) {
    super(message);
    this.name = "AiRepositoryError";
    this.status = status;
  }
}

const DB_UNAVAILABLE = "The database is not available right now. Please try again shortly.";

async function run<T>(work: () => Promise<T>): Promise<T> {
  if (!hasDatabase) throw new AiRepositoryError(DB_UNAVAILABLE, 503);
  try {
    return await work();
  } catch (error) {
    if (error instanceof AiRepositoryError) throw error;
    throw new AiRepositoryError(DB_UNAVAILABLE, 503);
  }
}

export const MAX_MESSAGE_CHARS = 1000;
/** Oldest messages are trimmed from the transcript beyond this. */
export const MAX_MESSAGES_PER_CONVERSATION = 200;

export async function listConversations(userId: number): Promise<ConversationSummary[]> {
  return run(async () => {
    const rows = await db
      .select({
        id: aiConversations.id,
        title: aiConversations.title,
        createdAt: aiConversations.createdAt,
        updatedAt: aiConversations.updatedAt,
        messageCount: count(aiMessages.id),
      })
      .from(aiConversations)
      .leftJoin(aiMessages, eq(aiMessages.conversationId, aiConversations.id))
      .where(eq(aiConversations.userId, userId))
      .groupBy(aiConversations.id)
      .orderBy(desc(aiConversations.updatedAt))
      .limit(30);
    return rows.map((r) => ({ id: r.id, title: r.title, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(), messageCount: Number(r.messageCount) }));
  });
}

export async function getConversation(userId: number, id: number): Promise<{ id: number; title: string; messages: AssistantMessageRecord[] } | null> {
  return run(async () => {
    const conv = await db.select().from(aiConversations).where(and(eq(aiConversations.id, id), eq(aiConversations.userId, userId))).limit(1);
    if (!conv[0]) return null;
    const rows = await db
      .select()
      .from(aiMessages)
      .where(and(eq(aiMessages.conversationId, id), eq(aiMessages.userId, userId)))
      .orderBy(asc(aiMessages.createdAt), asc(aiMessages.id))
      .limit(MAX_MESSAGES_PER_CONVERSATION);
    return {
      id: conv[0].id,
      title: conv[0].title,
      messages: rows.map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        payload: (m.payload as AssistantMessageRecord["payload"]) ?? null,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  });
}

export async function createConversation(userId: number, title: string): Promise<number> {
  return run(async () => {
    const rows = await db.insert(aiConversations).values({ userId, title }).returning({ id: aiConversations.id });
    return rows[0].id;
  });
}

export async function appendMessages(
  userId: number,
  conversationId: number,
  entries: { role: "user" | "assistant"; content: string; payload?: Omit<AssistantReply, "text"> | null }[],
): Promise<AssistantMessageRecord[]> {
  return run(async () => {
    const rows = await db
      .insert(aiMessages)
      .values(entries.map((e) => ({ conversationId, userId, role: e.role, content: e.content, payload: e.payload ?? null })))
      .returning();
    await db.update(aiConversations).set({ updatedAt: new Date() }).where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, userId)));
    return rows.map((m) => ({ id: m.id, role: m.role as "user" | "assistant", content: m.content, payload: (m.payload as AssistantMessageRecord["payload"]) ?? null, createdAt: m.createdAt.toISOString() }));
  });
}

export async function clearConversation(userId: number, id: number): Promise<boolean> {
  return run(async () => {
    const owned = await db.select({ id: aiConversations.id }).from(aiConversations).where(and(eq(aiConversations.id, id), eq(aiConversations.userId, userId))).limit(1);
    if (!owned[0]) return false;
    await db.delete(aiMessages).where(and(eq(aiMessages.conversationId, id), eq(aiMessages.userId, userId)));
    return true;
  });
}

export async function deleteConversation(userId: number, id: number): Promise<boolean> {
  return run(async () => {
    const owned = await db.select({ id: aiConversations.id }).from(aiConversations).where(and(eq(aiConversations.id, id), eq(aiConversations.userId, userId))).limit(1);
    if (!owned[0]) return false;
    await db.delete(aiMessages).where(and(eq(aiMessages.conversationId, id), eq(aiMessages.userId, userId)));
    await db.delete(aiConversations).where(and(eq(aiConversations.id, id), eq(aiConversations.userId, userId)));
    return true;
  });
}
