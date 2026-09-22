/**
 * Phase 6 — AI provider abstraction.
 *
 * NutriPlan had no external AI integration before this phase, so this is
 * the single place that knows how to talk to a language model. It is
 * configured entirely through environment variables and is OPTIONAL: when
 * nothing is configured the assistant still works, using the deterministic
 * grounded responder in assistantService.ts.
 *
 *   AI_PROVIDER   "openai" | "anthropic" | "none"   (default: none)
 *   AI_API_KEY    provider key (never sent to the client, never logged)
 *   AI_MODEL      model id (defaults below)
 *   AI_BASE_URL   optional override for OpenAI-compatible gateways
 *   AI_TIMEOUT_MS optional, default 20000
 *
 * The provider only ever produces prose. It never touches the database:
 * every fact it is given comes from the application's own services, and
 * every action it "proposes" is a fixed structured card produced by the
 * server, validated again when the user confirms it.
 */

export type AiProviderName = "openai" | "anthropic" | "none";

export interface AiChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiProviderInfo {
  name: AiProviderName;
  configured: boolean;
  model: string | null;
}

export class AiProviderError extends Error {
  kind: "unavailable" | "timeout" | "rate_limited" | "invalid_response" | "auth";
  constructor(kind: AiProviderError["kind"], message: string) {
    super(message);
    this.name = "AiProviderError";
    this.kind = kind;
  }
}

const DEFAULT_MODELS: Record<Exclude<AiProviderName, "none">, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-latest",
};

function providerName(): AiProviderName {
  const raw = (process.env.AI_PROVIDER ?? "none").trim().toLowerCase();
  return raw === "openai" || raw === "anthropic" ? raw : "none";
}

export function providerInfo(): AiProviderInfo {
  const name = providerName();
  const key = process.env.AI_API_KEY?.trim();
  const configured = name !== "none" && Boolean(key);
  return {
    name,
    configured,
    model: configured ? (process.env.AI_MODEL?.trim() || DEFAULT_MODELS[name as Exclude<AiProviderName, "none">]) : null,
  };
}

function timeoutMs(): number {
  const n = Number(process.env.AI_TIMEOUT_MS ?? "20000");
  return Number.isFinite(n) && n >= 1000 ? n : 20000;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new AiProviderError("timeout", "The AI service took too long to respond.");
    }
    throw new AiProviderError("unavailable", "The AI service could not be reached.");
  } finally {
    clearTimeout(timer);
  }
}

function classifyStatus(status: number): AiProviderError {
  if (status === 401 || status === 403) return new AiProviderError("auth", "The AI service rejected the configured credentials.");
  if (status === 429) return new AiProviderError("rate_limited", "The AI service is busy right now.");
  return new AiProviderError("unavailable", "The AI service is unavailable right now.");
}

async function completeOpenAi(messages: AiChatMessage[], model: string, key: string): Promise<string> {
  const base = (process.env.AI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
  const res = await fetchWithTimeout(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, temperature: 0.3, max_tokens: 600 }),
  });
  if (!res.ok) throw classifyStatus(res.status);
  const data = (await res.json().catch(() => null)) as { choices?: { message?: { content?: unknown } }[] } | null;
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new AiProviderError("invalid_response", "The AI service returned an empty answer.");
  return text.trim();
}

async function completeAnthropic(messages: AiChatMessage[], model: string, key: string): Promise<string> {
  const base = (process.env.AI_BASE_URL?.trim() || "https://api.anthropic.com").replace(/\/$/, "");
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const rest = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content }));
  const res = await fetchWithTimeout(`${base}/v1/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, system, messages: rest, max_tokens: 600, temperature: 0.3 }),
  });
  if (!res.ok) throw classifyStatus(res.status);
  const data = (await res.json().catch(() => null)) as { content?: { type?: string; text?: unknown }[] } | null;
  const text = data?.content?.filter((c) => c.type === "text").map((c) => (typeof c.text === "string" ? c.text : "")).join("").trim();
  if (!text) throw new AiProviderError("invalid_response", "The AI service returned an empty answer.");
  return text;
}

/**
 * Produces prose for the given messages. Throws AiProviderError when the
 * provider is not configured or fails; callers decide how to degrade.
 */
export async function complete(messages: AiChatMessage[]): Promise<string> {
  const info = providerInfo();
  const key = process.env.AI_API_KEY?.trim();
  if (!info.configured || !key || !info.model) {
    throw new AiProviderError("unavailable", "No AI provider is configured.");
  }
  if (info.name === "openai") return completeOpenAi(messages, info.model, key);
  return completeAnthropic(messages, info.model, key);
}
