"use client";

/**
 * Part 13 — Personal AI chat interface.
 *
 * A clean, health-focused chat UI with voice input/output. Every response
 * comes from the rule-based engine that reads real application state.
 * Write actions show a confirmation card before being applied.
 */
import {
  Bot,
  Check,
  ChevronDown,
  Loader2,
  Mic,
  MicOff,
  Send,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAssistant, type ChatMessage } from "@/context/AssistantContext";
import { useNutrition } from "@/context/NutritionContext";
import { useDietPlan } from "@/context/DietPlanContext";
import { Button, EmptyState } from "@/components/ui/core";
import { cn } from "@/lib/cn";

const QUICK_ACTIONS = [
  { label: "Explain my diet", query: "explain my diet" },
  { label: "Check today's nutrition", query: "what are my calories and protein" },
  { label: "Find high-protein foods", query: "find high-protein foods" },
  { label: "Why this meal?", query: "why this meal" },
  { label: "Create shopping list", query: "create shopping list" },
  { label: "What did my upload say?", query: "what did my document say" },
];

export function AssistantChat() {
  const { processed } = useNutrition();
  const { plan } = useDietPlan();
  const {
    messages,
    sendMessage,
    clearConversation,
    processing,
    voice,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    voiceEnabled,
    setVoiceEnabled,
    pendingAction,
    confirmAction,
    cancelAction,
  } = useAssistant();

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, processing]);

  const handleSend = useCallback(() => {
    if (!input.trim() || processing) return;
    sendMessage(input);
    setInput("");
  }, [input, processing, sendMessage]);

  const hasData = processed !== null || plan !== null;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-50 text-brand-400">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-bold text-ink">
              Personal Nutrition Assistant
            </h2>
            <p className="text-xs text-muted">
              {hasData
                ? "Ready to answer questions about your nutrition"
                : "Complete your profile to unlock personalised answers"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setVoiceEnabled(!voiceEnabled)}
            aria-label={voiceEnabled ? "Mute voice responses" : "Enable voice responses"}
            className={cn(
              "grid h-8 w-8 place-items-center rounded-[10px] transition-colors",
              voiceEnabled
                ? "bg-brand-50 text-brand-400"
                : "text-muted hover:bg-canvas",
            )}
          >
            {voiceEnabled ? (
              <Volume2 className="h-4 w-4" aria-hidden="true" />
            ) : (
              <VolumeX className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            onClick={clearConversation}
            aria-label="Clear conversation"
            className="grid h-8 w-8 place-items-center rounded-[10px] text-muted transition-colors hover:bg-danger-50 hover:text-danger-600"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-y-auto px-5 py-4"
        role="log"
        aria-label="Conversation"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 py-10">
            <EmptyState
              icon={<Bot className="h-8 w-8 text-brand-400" aria-hidden="true" />}
              title="Hi, I'm your Nutrition Assistant"
              description="Ask me about your BMI, calories, protein, foods, meal replacements, shopping lists, or anything nutrition-related."
            />
            <div className="flex flex-wrap justify-center gap-2">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => sendMessage(action.query)}
                  className="rounded-pill border border-line bg-surface px-3.5 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-brand-400/50 hover:bg-brand-50"
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                onConfirm={() => confirmAction(message.id)}
                onCancel={() => cancelAction(message.id)}
                onSpeak={speak}
                speaking={voice.speaking}
                onStopSpeak={stopSpeaking}
                isPendingAction={pendingAction?.id === message.id}
              />
            ))}
            {processing && (
              <div className="flex items-center gap-2 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Thinking…
              </div>
            )}
          </>
        )}
      </div>

      {/* Voice error */}
      {voice.error && (
        <div className="mx-5 mb-2 rounded-[10px] bg-accent-200/30 px-3.5 py-2 text-xs text-accent-300">
          {voice.error}
        </div>
      )}

      {/* Voice transcript */}
      {voice.transcript && !voice.listening && (
        <div className="mx-5 mb-2 rounded-[10px] bg-canvas px-3.5 py-2 text-xs text-muted">
          <span className="font-semibold text-ink">You said:</span>{" "}
          &ldquo;{voice.transcript}&rdquo;
        </div>
      )}

      {/* Input */}
      <div className="border-t border-line p-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={voice.listening ? stopListening : startListening}
            disabled={!voice.supported}
            aria-label={voice.listening ? "Stop listening" : "Start voice input"}
            className={cn(
              "grid h-11 w-11 shrink-0 place-items-center rounded-[10px] transition-all",
              voice.listening
                ? "bg-danger-800 text-white animate-pulse"
                : voice.supported
                  ? "bg-brand-50 text-brand-400 hover:bg-brand-100"
                  : "bg-canvas text-muted cursor-not-allowed",
            )}
          >
            {voice.listening ? (
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-surface opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-surface" />
              </span>
            ) : (
              <Mic className="h-5 w-5" aria-hidden="true" />
            )}
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSend();
            }}
            placeholder={
              voice.listening ? "Listening…" : "Ask about your nutrition…"
            }
            disabled={processing}
            className="h-11 flex-1 rounded-[10px] border border-line bg-surface px-4 text-sm text-ink placeholder:text-muted/70 transition-[border-color,box-shadow] focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15 disabled:opacity-60"
          />

          <Button
            onClick={handleSend}
            disabled={!input.trim() || processing}
            className="h-11 w-11 shrink-0 !px-0"
            aria-label="Send message"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        {!voice.supported && (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
            <MicOff className="h-3 w-3" aria-hidden="true" />
            Voice input not supported in this browser — typing works fine.
          </p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Message bubble                                                      */
/* ------------------------------------------------------------------ */

function MessageBubble({
  message,
  onConfirm,
  onCancel,
  onSpeak,
  speaking,
  onStopSpeak,
  isPendingAction,
}: {
  message: ChatMessage;
  onConfirm: () => void;
  onCancel: () => void;
  onSpeak: (text: string) => void;
  speaking: boolean;
  onStopSpeak: () => void;
  isPendingAction: boolean;
}) {
  const isUser = message.role === "user";
  const [expanded, setExpanded] = useState(false);
  const hasFoods = Boolean(
    message.data &&
      typeof message.data === "object" &&
      "foods" in (message.data as Record<string, unknown>),
  );
  const hasAction = Boolean(message.action && isPendingAction);

  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <span
        className={cn(
          "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold",
          isUser ? "bg-brand-700 text-white" : "bg-brand-50 text-brand-400",
        )}
        aria-hidden="true"
      >
        {isUser ? "You" : <Bot className="h-4 w-4" />}
      </span>

      <div className={cn("max-w-[80%]", isUser && "text-right")}>
        <div
          className={cn(
            "inline-block rounded-card px-4 py-3 text-sm leading-relaxed",
            isUser
              ? "bg-brand-700 text-white"
              : "border border-line bg-surface text-ink",
          )}
        >
          <p className="whitespace-pre-wrap">{message.text}</p>

          {hasFoods && (
            <div className="mt-3 border-t border-line/50 pt-3 text-left">
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-xs font-semibold text-brand-400"
                aria-expanded={expanded}
              >
                {expanded ? "Hide" : "Show"} details
                <ChevronDown
                  className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")}
                  aria-hidden="true"
                />
              </button>
              {expanded && (
                <ul className="mt-2 space-y-1 text-xs">
                  {(
                    (message.data as { foods: Array<{ name: string; calories: number; proteinGrams: number }> })
                      .foods
                  ).map((f, i) => (
                    <li key={i} className="text-muted">
                      <span className="font-semibold text-ink">{f.name}</span>
                      {" — "}
                      {f.calories} kcal, {Math.round(f.proteinGrams)}g protein
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {hasAction && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-line/50 pt-3 text-left">
              <Button
                size="sm"
                onClick={onConfirm}
                icon={<Check className="h-3.5 w-3.5" aria-hidden="true" />}
              >
                {message.action!.label}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onCancel}
                icon={<X className="h-3.5 w-3.5" aria-hidden="true" />}
              >
                Cancel
              </Button>
            </div>
          )}

          {!isUser && (
            <div className="mt-2 text-left">
              <button
                type="button"
                onClick={() => (speaking ? onStopSpeak() : onSpeak(message.text))}
                aria-label={speaking ? "Stop speaking" : "Read aloud"}
                className="text-[11px] font-semibold text-muted hover:text-brand-400"
              >
                {speaking ? "Stop" : "Read aloud"}
              </button>
            </div>
          )}
        </div>

        <p className="mt-1 text-[10px] text-muted">
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
}
