"use client";

/**
 * Phase 6 — assistant chat interface.
 *
 * Same NutriPlan card, header and bubble styling as before; adds
 * structured cards (meals, recipes, stats), confirm-to-apply action
 * buttons, suggestion chips, a typing indicator and per-user conversation
 * history. Nothing rendered here comes from free-form model output except
 * the prose text; every card is application data.
 */
import {
  Bot,
  Check,
  ChevronDown,
  Clock,
  History,
  Loader2,
  Mic,
  MicOff,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAssistant, type ChatMessage } from "@/context/AssistantContext";
import { Badge, Button, EmptyState } from "@/components/ui/core";
import { SUGGESTION_CHIPS, type AssistantAction, type AssistantCard, type DataSourceLabel } from "@/services/ai/types";
import { cn } from "@/lib/cn";

const MAX_INPUT = 1000;

export function AssistantChat({ initialPrompt }: { initialPrompt?: string } = {}) {
  const {
    messages,
    sendMessage,
    runAction,
    newConversation,
    clearConversation,
    conversations,
    conversationId,
    openConversation,
    deleteConversation,
    loadingHistory,
    providerConfigured,
    processing,
    actionBusy,
    voice,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    voiceEnabled,
    setVoiceEnabled,
  } = useAssistant();

  const [input, setInput] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sentInitial = useRef(false);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, processing]);

  useEffect(() => {
    if (!initialPrompt || sentInitial.current) return;
    sentInitial.current = true;
    const task = setTimeout(() => sendMessage(initialPrompt), 0);
    return () => clearTimeout(task);
  }, [initialPrompt, sendMessage]);

  const handleSend = useCallback(() => {
    if (!input.trim() || processing) return;
    sendMessage(input);
    setInput("");
    inputRef.current?.focus();
  }, [input, processing, sendMessage]);

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant" && !m.error);
  const followUps = lastAssistant?.payload?.followUps ?? [];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-400">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-ink">Personal Nutrition Assistant</h2>
            <p className="truncate text-xs text-muted">
              {providerConfigured === null ? "Grounded in your NutriPlan data" : providerConfigured ? "AI phrasing on · answers grounded in your data" : "Answers grounded in your NutriPlan data"}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <IconButton label={historyOpen ? "Hide conversation history" : "Show conversation history"} active={historyOpen} onClick={() => setHistoryOpen((v) => !v)}>
            <History className="h-4 w-4" aria-hidden="true" />
          </IconButton>
          <IconButton label="New conversation" onClick={() => { newConversation(); setHistoryOpen(false); inputRef.current?.focus(); }}>
            <Plus className="h-4 w-4" aria-hidden="true" />
          </IconButton>
          <IconButton label={voiceEnabled ? "Mute voice responses" : "Enable voice responses"} active={voiceEnabled} onClick={() => setVoiceEnabled(!voiceEnabled)}>
            {voiceEnabled ? <Volume2 className="h-4 w-4" aria-hidden="true" /> : <VolumeX className="h-4 w-4" aria-hidden="true" />}
          </IconButton>
          <IconButton label="Clear conversation" danger onClick={() => void clearConversation()} disabled={messages.length === 0}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </IconButton>
        </div>
      </div>

      {/* History drawer */}
      {historyOpen && (
        <div className="entry-enter border-b border-line bg-canvas/60 px-4 py-3 sm:px-5" role="region" aria-label="Conversation history">
          {conversations.length === 0 ? (
            <p className="text-xs text-muted">No saved conversations yet. Your conversations are private to your account.</p>
          ) : (
            <ul className="max-h-44 space-y-1 overflow-y-auto">
              {conversations.map((c) => (
                <li key={c.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { void openConversation(c.id); setHistoryOpen(false); }}
                    aria-current={c.id === conversationId ? "true" : undefined}
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs transition-colors hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
                      c.id === conversationId ? "bg-brand-50 font-semibold text-brand-400" : "text-ink",
                    )}
                  >
                    <Clock className="h-3 w-3 shrink-0 text-muted" aria-hidden="true" />
                    <span className="truncate">{c.title}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-muted">{c.messageCount} msg</span>
                  </button>
                  <IconButton label={`Delete conversation "${c.title}"`} danger onClick={() => void deleteConversation(c.id)}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5" role="log" aria-label="Conversation" aria-live="polite" aria-busy={processing || loadingHistory}>
        {loadingHistory ? (
          <div className="space-y-3" aria-label="Loading conversation">
            <div className="skeleton h-12 w-2/3" />
            <div className="skeleton ml-auto h-10 w-1/2" />
            <div className="skeleton h-16 w-3/4" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 py-8">
            <EmptyState
              icon={<Bot className="h-8 w-8 text-brand-400" aria-hidden="true" />}
              title="Hi, I'm your Nutrition Assistant"
              description="Ask what's left in your targets, for a meal that fits, to replace a planned meal, to explain today's or this week's nutrition, or what you can cook from your pantry. Every number comes from your own NutriPlan data."
            />
            <SuggestionChips prompts={SUGGESTION_CHIPS.map((c) => c.prompt)} labels={SUGGESTION_CHIPS.map((c) => c.label)} onPick={sendMessage} disabled={processing} />
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                onAction={(action) => runAction(action, message.id)}
                actionBusy={actionBusy}
                onSpeak={speak}
                speaking={voice.speaking}
                onStopSpeak={stopSpeaking}
              />
            ))}
            {processing && <TypingIndicator />}
          </>
        )}
      </div>

      {/* Follow-up chips */}
      {!processing && messages.length > 0 && followUps.length > 0 && (
        <div className="px-4 pb-2 sm:px-5">
          <SuggestionChips prompts={followUps} onPick={sendMessage} disabled={processing} compact />
        </div>
      )}

      {voice.error && <div className="mx-4 mb-2 rounded-[10px] bg-accent-200/30 px-3.5 py-2 text-xs text-accent-300 sm:mx-5" role="status">{voice.error}</div>}

      {/* Input */}
      <div className="border-t border-line p-3 sm:p-4">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
        >
          <button
            type="button"
            onClick={voice.listening ? stopListening : startListening}
            disabled={!voice.supported}
            aria-label={voice.listening ? "Stop listening" : "Start voice input"}
            className={cn(
              "grid h-11 w-11 shrink-0 place-items-center rounded-[10px] transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
              voice.listening ? "animate-pulse bg-danger-800 text-white" : voice.supported ? "bg-brand-50 text-brand-400 hover:bg-brand-100" : "cursor-not-allowed bg-canvas text-muted",
            )}
          >
            {voice.listening ? <span className="relative inline-flex h-3 w-3 rounded-full bg-surface" /> : <Mic className="h-5 w-5" aria-hidden="true" />}
          </button>

          <label htmlFor="assistant-input" className="sr-only">Message the assistant</label>
          <input
            id="assistant-input"
            ref={inputRef}
            type="text"
            value={input}
            maxLength={MAX_INPUT}
            onChange={(e) => setInput(e.target.value)}
            placeholder={voice.listening ? "Listening…" : "Ask about your nutrition…"}
            disabled={processing}
            autoComplete="off"
            className="h-11 min-w-0 flex-1 rounded-[10px] border border-line bg-surface px-4 text-sm text-ink placeholder:text-muted/70 transition-[border-color,box-shadow] focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15 disabled:opacity-60"
          />

          <Button type="submit" disabled={!input.trim() || processing} loading={processing} className="h-11 w-11 shrink-0 !px-0" aria-label="Send message">
            {!processing && <Send className="h-4 w-4" aria-hidden="true" />}
          </Button>
        </form>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
          {!voice.supported && <MicOff className="h-3 w-3" aria-hidden="true" />}
          General nutrition information, not medical advice. Actions are applied only after you confirm.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

function IconButton({ label, onClick, children, active, danger, disabled }: { label: string; onClick: () => void; children: React.ReactNode; active?: boolean; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      className={cn(
        "grid h-8 w-8 place-items-center rounded-[10px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-40",
        active ? "bg-brand-50 text-brand-400" : "text-muted",
        danger ? "hover:bg-danger-50 hover:text-danger-600" : "hover:bg-canvas hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

export function SuggestionChips({ prompts, labels, onPick, disabled, compact }: { prompts: string[]; labels?: string[]; onPick: (prompt: string) => void; disabled?: boolean; compact?: boolean }) {
  return (
    <div className={cn("flex flex-wrap gap-2", compact ? "" : "justify-center")} role="group" aria-label="Suggested prompts">
      {prompts.map((prompt, i) => (
        <button
          key={prompt}
          type="button"
          disabled={disabled}
          onClick={() => onPick(prompt)}
          className={cn(
            "rounded-pill border border-line bg-surface font-semibold text-ink transition-colors hover:border-brand-400/50 hover:bg-brand-50 hover:text-brand-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-50",
            compact ? "px-3 py-1 text-[11px]" : "px-3.5 py-1.5 text-xs",
          )}
        >
          {labels?.[i] ?? prompt}
        </button>
      ))}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="entry-enter flex items-center gap-3" role="status" aria-label="Assistant is thinking">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-400" aria-hidden="true">
        <Bot className="h-4 w-4" />
      </span>
      <span className="inline-flex items-center gap-1 rounded-card border border-line bg-surface px-4 py-3" aria-hidden="true">
        <span className="typing-dot" />
        <span className="typing-dot [animation-delay:150ms]" />
        <span className="typing-dot [animation-delay:300ms]" />
      </span>
      <span className="sr-only">Thinking…</span>
    </div>
  );
}

const SOURCE_TONE: Record<DataSourceLabel, "brand" | "neutral" | "warning"> = {
  Logged: "brand",
  Planned: "neutral",
  Calculated: "neutral",
  Estimated: "warning",
  Reference: "neutral",
  General: "neutral",
};

function MessageBubble({ message, onAction, actionBusy, onSpeak, speaking, onStopSpeak }: {
  message: ChatMessage;
  onAction: (action: AssistantAction) => Promise<unknown>;
  actionBusy: string | null;
  onSpeak: (text: string) => void;
  speaking: boolean;
  onStopSpeak: () => void;
}) {
  const isUser = message.role === "user";
  const payload = message.payload;
  const cards = payload?.cards ?? [];
  const actions = payload?.actions ?? [];
  const applied = message.appliedAction;

  return (
    <div className={cn("entry-enter flex gap-3", isUser && "flex-row-reverse")}>
      <span className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold", isUser ? "bg-brand-700 text-white" : "bg-brand-50 text-brand-400")} aria-hidden="true">
        {isUser ? "You" : <Bot className="h-4 w-4" />}
      </span>

      <div className={cn("min-w-0 max-w-[88%] sm:max-w-[80%]", isUser && "text-right")}>
        <div className={cn("inline-block w-full rounded-card px-4 py-3 text-left text-sm leading-relaxed", isUser ? "bg-brand-700 text-white" : message.error ? "border border-danger-500/30 bg-danger-50 text-danger-700" : "border border-line bg-surface text-ink")}>
          <p className="whitespace-pre-wrap">{message.text}</p>

          {!isUser && payload && (payload.sources.length > 0 || payload.scope === "general") && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {payload.scope === "general" ? (
                <Badge tone="neutral" className="px-2 py-0.5 text-[10px]">General information</Badge>
              ) : (
                <Badge tone="brand" className="px-2 py-0.5 text-[10px]">Personalised</Badge>
              )}
              {payload.sources.map((s) => (
                <Badge key={s} tone={SOURCE_TONE[s]} className="px-2 py-0.5 text-[10px]">{s}</Badge>
              ))}
              {payload.aiGenerated && <Badge tone="neutral" className="px-2 py-0.5 text-[10px]">AI-phrased</Badge>}
            </div>
          )}

          {cards.length > 0 && (
            <div className="mt-3 grid gap-2 border-t border-line/50 pt-3">
              {cards.map((card, i) => (
                <CardView key={i} card={card} onAction={onAction} busyKey={actionBusy} messageId={message.id} applied={applied} />
              ))}
            </div>
          )}

          {actions.length > 0 && !applied && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-line/50 pt-3">
              {actions.map((action, i) => (
                <ActionButton key={i} action={action} onAction={onAction} busy={actionBusy === `${message.id}:${action.type}:${"foodId" in action ? action.foodId : (action as { amountMl?: number }).amountMl}`} />
              ))}
            </div>
          )}

          {applied && (
            <p className="mt-3 flex items-center gap-1.5 border-t border-line/50 pt-3 text-xs font-semibold text-brand-400">
              <Check className="h-3.5 w-3.5" aria-hidden="true" /> {applied} — applied
            </p>
          )}

          {!isUser && !message.error && (
            <div className="mt-2">
              <button type="button" onClick={() => (speaking ? onStopSpeak() : onSpeak(message.text))} aria-label={speaking ? "Stop speaking" : "Read aloud"} className="text-[11px] font-semibold text-muted hover:text-brand-400">
                {speaking ? "Stop" : "Read aloud"}
              </button>
            </div>
          )}
        </div>

        <p className="mt-1 text-[10px] text-muted">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </div>
  );
}

function ActionButton({ action, onAction, busy }: { action: AssistantAction; onAction: (action: AssistantAction) => Promise<unknown>; busy: boolean }) {
  const isWrite = action.type !== "navigate";
  return (
    <Button size="sm" variant={isWrite ? "primary" : "outline"} loading={busy} onClick={() => void onAction(action)} icon={isWrite ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : undefined}>
      {action.label}
    </Button>
  );
}

function CardView({ card, onAction, busyKey, messageId, applied }: { card: AssistantCard; onAction: (action: AssistantAction) => Promise<unknown>; busyKey: string | null; messageId: string; applied?: string }) {
  const [open, setOpen] = useState(false);
  if (card.kind === "stats") {
    return (
      <div className="rounded-[12px] border border-line bg-canvas/60 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold text-ink">{card.title}</p>
          <Badge tone={SOURCE_TONE[card.source]} className="px-2 py-0.5 text-[10px]">{card.source}</Badge>
        </div>
        <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
          {card.rows.map((row) => (
            <div key={row.label} className="flex flex-col">
              <dt className="text-muted">{row.label}</dt>
              <dd className="font-semibold text-ink">{row.value}{row.hint && <span className="ml-1 font-normal text-muted">· {row.hint}</span>}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }
  const isFood = card.kind === "food";
  const title = card.name;
  const metric = isFood ? `${Math.round(card.calories)} kcal · ${Math.round(card.proteinGrams)} g protein · ${Math.round(card.carbohydrateGrams)} g carbs · ${Math.round(card.fatGrams)} g fat` : `${Math.round(card.calories)} kcal · ${Math.round(card.proteinGrams)} g protein per serving`;
  return (
    <div className="card-hover rounded-[12px] border border-line bg-surface p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink">{title}</p>
          <p className="text-xs text-muted">{isFood ? `${card.portionLabel} · ${card.prepMinutes} min` : `${card.prepMinutes} min prep${card.hasDetail ? "" : " · summary only"}`}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {isFood && card.labels.slice(0, 2).map((l) => <Badge key={l} tone="neutral" className="px-2 py-0.5 text-[10px]">{l}</Badge>)}
          <Badge tone="neutral" className="px-2 py-0.5 text-[10px]">Reference</Badge>
        </div>
      </div>
      <p className="mt-1.5 text-xs text-ink">{metric}</p>
      {isFood ? (
        <p className="mt-1 text-xs text-muted">{card.reason}</p>
      ) : (
        <div className="mt-1 text-xs text-muted">
          {card.matched.length > 0 && <p>From your pantry: {card.matched.join(", ")}</p>}
          {card.missing.length > 0 && (
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="mt-0.5 inline-flex items-center gap-1 font-semibold text-brand-400">
              {open ? "Hide" : "Show"} missing ({card.missing.length}) <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} aria-hidden="true" />
            </button>
          )}
          {open && <p className="mt-0.5">Missing: {card.missing.join(", ")}</p>}
        </div>
      )}
      {!applied && card.actions.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {card.actions.map((action, i) => (
            <ActionButton key={i} action={action} onAction={onAction} busy={busyKey === `${messageId}:${action.type}:${"foodId" in action ? action.foodId : (action as { amountMl?: number }).amountMl}`} />
          ))}
        </div>
      )}
    </div>
  );
}
