"use client";

/**
 * Phase 6 — assistant state.
 *
 * Replaces the Part 13 in-browser rule engine with the server-side
 * assistant (/api/assistant/*). The server reads the user's real records,
 * builds grounded replies and structured action cards; this context only
 * renders them and forwards confirmed actions back for validation.
 * Voice input/output is kept exactly as before and degrades gracefully.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { apiClient, toUserMessage } from "@/services/apiClient";
import { toDateKey } from "@/services/foodLog/calculations";
import { useDayLog } from "@/context/DayLogContext";
import { useMealPlan } from "@/context/MealPlanContext";
import type { AssistantAction, AssistantMessageRecord, AssistantReply, ConversationSummary } from "@/services/ai/types";

// Web Speech API type declarations (not in the default TS DOM lib for Node)
interface SpeechRecognitionResultItem { transcript: string }
interface SpeechRecognitionResult { isFinal: boolean; 0: SpeechRecognitionResultItem; length: number }
interface SpeechRecognitionEvent extends Event { results: { 0: SpeechRecognitionResult; length: number } }
interface SpeechRecognitionErrorEvent extends Event { error: string }
interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: string;
  payload: Omit<AssistantReply, "text"> | null;
  /** Set when a message failed to send (client-side only). */
  error?: boolean;
  /** Set after an action from this message was applied. */
  appliedAction?: string;
}

interface VoiceState {
  supported: boolean;
  listening: boolean;
  speaking: boolean;
  transcript: string;
  error: string | null;
}

export interface ActionOutcome {
  ok: boolean;
  message: string;
}

interface AssistantContextValue {
  messages: ChatMessage[];
  conversationId: number | null;
  conversations: ConversationSummary[];
  loadingHistory: boolean;
  providerConfigured: boolean | null;
  sendMessage: (text: string) => void;
  runAction: (action: AssistantAction, messageId?: string) => Promise<ActionOutcome>;
  newConversation: () => void;
  openConversation: (id: number) => Promise<void>;
  clearConversation: () => Promise<void>;
  deleteConversation: (id: number) => Promise<void>;
  refreshConversations: () => Promise<void>;
  voice: VoiceState;
  startListening: () => void;
  stopListening: () => void;
  speak: (text: string) => void;
  stopSpeaking: () => void;
  voiceEnabled: boolean;
  setVoiceEnabled: (v: boolean) => void;
  processing: boolean;
  actionBusy: string | null;
}

const AssistantContext = createContext<AssistantContextValue | null>(null);

let messageCounter = 0;
function nextId() {
  messageCounter += 1;
  return `msg-${Date.now()}-${messageCounter}`;
}

function fromRecord(m: AssistantMessageRecord): ChatMessage {
  return { id: `db-${m.id}`, role: m.role, text: m.content, timestamp: m.createdAt, payload: m.payload };
}

export function AssistantProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const dayLog = useDayLog();
  const mealPlan = useMealPlan();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [providerConfigured, setProviderConfigured] = useState<boolean | null>(null);
  const [processing, setProcessing] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voice, setVoice] = useState<VoiceState>({
    supported: typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window),
    listening: false,
    speaking: false,
    transcript: "",
    error: null,
  });

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const inFlight = useRef(false);

  const refreshConversations = useCallback(async () => {
    try {
      const data = await apiClient.get<{ conversations: ConversationSummary[]; provider: { configured: boolean } }>("/api/assistant/conversations");
      setConversations(data.conversations);
      setProviderConfigured(data.provider.configured);
    } catch {
      /* History is optional; the chat still works without it. */
    }
  }, []);

  useEffect(() => {
    const task = setTimeout(() => void refreshConversations(), 0);
    return () => clearTimeout(task);
  }, [refreshConversations]);

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || inFlight.current) return;
      inFlight.current = true;
      const userMsg: ChatMessage = { id: nextId(), role: "user", text: trimmed, timestamp: new Date().toISOString(), payload: null };
      setMessages((prev) => [...prev, userMsg]);
      setProcessing(true);

      apiClient
        .post<{ conversationId: number; messages: AssistantMessageRecord[]; provider: { configured: boolean } }>("/api/assistant/chat", {
          message: trimmed,
          conversationId,
          today: toDateKey(),
          hour: new Date().getHours(),
        })
        .then((data) => {
          setConversationId(data.conversationId);
          setProviderConfigured(data.provider.configured);
          const assistant = data.messages.find((m) => m.role === "assistant");
          setMessages((prev) => [...prev, ...(assistant ? [fromRecord(assistant)] : [])]);
          void refreshConversations();
        })
        .catch((error) => {
          setMessages((prev) => [
            ...prev,
            { id: nextId(), role: "assistant", text: toUserMessage(error, "The assistant couldn't answer right now. Please try again."), timestamp: new Date().toISOString(), payload: null, error: true },
          ]);
        })
        .finally(() => {
          inFlight.current = false;
          setProcessing(false);
        });
    },
    [conversationId, refreshConversations],
  );

  /** Confirmed action → server validation → existing app function → UI refresh. */
  const runAction = useCallback(
    async (action: AssistantAction, messageId?: string): Promise<ActionOutcome> => {
      if (action.type === "navigate") {
        router.push(action.href);
        return { ok: true, message: "" };
      }
      const key = `${messageId ?? ""}:${action.type}:${"foodId" in action ? action.foodId : action.amountMl}`;
      setActionBusy(key);
      try {
        const data = await apiClient.post<{ ok: boolean; message: string }>("/api/assistant/actions", { action: { ...action, clientId: key } });
        // Refresh the contexts that own the changed data so every page updates.
        if (action.type === "log_food" || action.type === "add_water") void dayLog.reload();
        if (action.type === "replace_meal") void mealPlan.reload();
        if (messageId) setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, appliedAction: action.label } : m)));
        setMessages((prev) => [...prev, { id: nextId(), role: "assistant", text: `Done. ${data.message}`, timestamp: new Date().toISOString(), payload: null }]);
        return { ok: true, message: data.message };
      } catch (error) {
        const message = toUserMessage(error, "The action could not be completed.");
        setMessages((prev) => [...prev, { id: nextId(), role: "assistant", text: `I couldn't do that. ${message} Nothing was changed.`, timestamp: new Date().toISOString(), payload: null, error: true }]);
        return { ok: false, message };
      } finally {
        setActionBusy(null);
      }
    },
    [router, dayLog, mealPlan],
  );

  const newConversation = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    setVoice((v) => ({ ...v, speaking: false }));
  }, []);

  const openConversation = useCallback(async (id: number) => {
    setLoadingHistory(true);
    try {
      const data = await apiClient.get<{ conversation: { id: number; messages: AssistantMessageRecord[] } }>(`/api/assistant/conversations/${id}`);
      setConversationId(data.conversation.id);
      setMessages(data.conversation.messages.map(fromRecord));
    } catch (error) {
      setMessages([{ id: nextId(), role: "assistant", text: toUserMessage(error, "That conversation could not be loaded."), timestamp: new Date().toISOString(), payload: null, error: true }]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const clearConversation = useCallback(async () => {
    if (conversationId !== null) {
      try {
        await apiClient.patch(`/api/assistant/conversations/${conversationId}`, { clear: true });
      } catch {
        /* Local clear still proceeds; the server copy is retried next time. */
      }
    }
    setMessages([]);
    void refreshConversations();
  }, [conversationId, refreshConversations]);

  const deleteConversation = useCallback(
    async (id: number) => {
      try {
        await apiClient.delete(`/api/assistant/conversations/${id}`);
      } catch {
        /* ignore — list refresh will show the truth */
      }
      if (id === conversationId) newConversation();
      void refreshConversations();
    },
    [conversationId, newConversation, refreshConversations],
  );

  /* -------------------- voice -------------------- */

  const startListening = useCallback(() => {
    if (!voice.supported) {
      setVoice((v) => ({ ...v, error: "Voice input is not supported in this browser." }));
      return;
    }
    const SpeechRecognitionClass =
      (window as unknown as { SpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition;
    if (!SpeechRecognitionClass) return;
    const recognition: SpeechRecognitionInstance = new SpeechRecognitionClass();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setVoice((v) => ({ ...v, listening: true, error: null }));
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      setVoice((v) => ({ ...v, transcript }));
      if (transcript) sendMessage(transcript);
    };
    recognition.onerror = (event) => {
      setVoice((v) => ({
        ...v,
        listening: false,
        error:
          event.error === "not-allowed"
            ? "Microphone permission was denied."
            : event.error === "no-speech"
              ? "No speech was detected. Please try again."
              : "Voice recognition failed. You can still type.",
      }));
    };
    recognition.onend = () => setVoice((v) => ({ ...v, listening: false, transcript: "" }));
    recognitionRef.current = recognition;
    recognition.start();
  }, [voice.supported, sendMessage]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setVoice((v) => ({ ...v, listening: false }));
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!voiceEnabled || typeof window === "undefined" || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text.slice(0, 500));
      utterance.onstart = () => setVoice((v) => ({ ...v, speaking: true }));
      utterance.onend = () => setVoice((v) => ({ ...v, speaking: false }));
      utterance.onerror = () => setVoice((v) => ({ ...v, speaking: false }));
      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [voiceEnabled],
  );

  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    setVoice((v) => ({ ...v, speaking: false }));
  }, []);

  const lastSpokenId = useRef<string | null>(null);
  useEffect(() => {
    if (!voiceEnabled) return;
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    if (!last || lastSpokenId.current === last.id) return;
    lastSpokenId.current = last.id;
    speak(last.text);
  }, [messages, voiceEnabled, speak]);

  const value = useMemo<AssistantContextValue>(
    () => ({
      messages,
      conversationId,
      conversations,
      loadingHistory,
      providerConfigured,
      sendMessage,
      runAction,
      newConversation,
      openConversation,
      clearConversation,
      deleteConversation,
      refreshConversations,
      voice,
      startListening,
      stopListening,
      speak,
      stopSpeaking,
      voiceEnabled,
      setVoiceEnabled,
      processing,
      actionBusy,
    }),
    [messages, conversationId, conversations, loadingHistory, providerConfigured, sendMessage, runAction, newConversation, openConversation, clearConversation, deleteConversation, refreshConversations, voice, startListening, stopListening, speak, stopSpeaking, voiceEnabled, processing, actionBusy],
  );

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useAssistant(): AssistantContextValue {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error("useAssistant must be used inside AssistantProvider");
  return ctx;
}
