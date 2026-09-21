"use client";

/**
 * Part 13 — Personal AI assistant state.
 *
 * Holds the conversation, routes messages through the rule-based engine,
 * and manages write-action confirmations. Voice is optional and degrades
 * gracefully when the browser does not support it.
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
import type { AIResponse, AssistantMemory, ProposedAction } from "@/services/assistant/engine.ts";
import type { MealId } from "@/types/profile";
/**
 * The assistant engine imports the food database. It is loaded on the
 * first message rather than at page load so the chat UI paints instantly.
 */
const loadEngine = () => import("@/services/assistant/engine.ts");
const emptyMemory = (): AssistantMemory => ({
  lastFoodSearch: null,
  lastMealLabel: null,
  lastIntent: null,
});
import { useProfile } from "@/context/ProfileContext";
import { useNutrition } from "@/context/NutritionContext";
import { useDietPlan } from "@/context/DietPlanContext";
import { useAttachments } from "@/context/AttachmentsContext";

// Web Speech API type declarations (not in the default TS DOM lib for Node)
interface SpeechRecognitionResultItem {
  transcript: string;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  0: SpeechRecognitionResultItem;
  length: number;
}
interface SpeechRecognitionEvent extends Event {
  results: {
    0: SpeechRecognitionResult;
    length: number;
  };
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}
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
  /** When the assistant proposed a write action. */
  action?: AIResponse["action"];
  data?: unknown;
}

interface VoiceState {
  supported: boolean;
  listening: boolean;
  speaking: boolean;
  transcript: string;
  error: string | null;
}

interface AssistantContextValue {
  messages: ChatMessage[];
  sendMessage: (text: string) => void;
  clearConversation: () => void;
  memory: AssistantMemory;
  voice: VoiceState;
  startListening: () => void;
  stopListening: () => void;
  speak: (text: string) => void;
  stopSpeaking: () => void;
  voiceEnabled: boolean;
  setVoiceEnabled: (v: boolean) => void;
  pendingAction: ChatMessage | null;
  confirmAction: (messageId: string) => void;
  cancelAction: (messageId: string) => void;
  processing: boolean;
}

const AssistantContext = createContext<AssistantContextValue | null>(null);

let messageCounter = 0;
function nextId() {
  messageCounter += 1;
  return `msg-${Date.now()}-${messageCounter}`;
}

export function AssistantProvider({ children }: { children: ReactNode }) {
  const {
    profile,
    completion,
    updateWaterIntake,
    updateMeal,
    addFoodItem,
    updateFoodItem,
  } = useProfile();
  const { processed } = useNutrition();
  const { plan, replaceMeal } = useDietPlan();
  const { attachments } = useAttachments();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [processing, setProcessing] = useState(false);
  const [memory, setMemory] = useState<AssistantMemory>(emptyMemory());
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [pendingAction, setPendingAction] = useState<ChatMessage | null>(null);
  const [voice, setVoice] = useState<VoiceState>({
    supported:
      typeof window !== "undefined" &&
      ("SpeechRecognition" in window || "webkitSpeechRecognition" in window),
    listening: false,
    speaking: false,
    transcript: "",
    error: null,
  });

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const contextData = useMemo(
    () => ({
      profile,
      processed,
      plan,
      attachments,
      hasAnyData: completion.hasAnyData,
      memory,
    }),
    [profile, processed, plan, attachments, completion.hasAnyData, memory],
  );

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || processing) return;

      const userMsg: ChatMessage = {
        id: nextId(),
        role: "user",
        text: trimmed,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setProcessing(true);

      loadEngine()
        .then(({ processMessage }) => {
          const response = processMessage(trimmed, contextData);
          const assistantMsg: ChatMessage = {
            id: nextId(),
            role: "assistant",
            text: response.text,
            timestamp: new Date().toISOString(),
            action: response.action,
            data: response.data,
          };
          setMessages((prev) => [...prev, assistantMsg]);
          if (response.action) setPendingAction(assistantMsg);
        })
        .catch(() => {
          setMessages((prev) => [
            ...prev,
            {
              id: nextId(),
              role: "assistant",
              text: "Something went wrong while processing your request. Please try again.",
              timestamp: new Date().toISOString(),
            },
          ]);
        })
        .finally(() => setProcessing(false));
    },
    [processing, contextData],
  );

  const clearConversation = useCallback(() => {
    setMessages([]);
    setMemory(emptyMemory());
    setPendingAction(null);
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setVoice((v) => ({ ...v, speaking: false }));
  }, []);

  /* -------------------- write actions -------------------- */

  /**
   * Executes a confirmed write action against the REAL application state
   * and reports the genuine outcome. If the underlying operation fails,
   * the assistant says so — it never claims "Done" for a change that did
   * not happen.
   */
  const executeProposal = useCallback(
    async (proposal: ProposedAction): Promise<{ ok: boolean; text: string }> => {
      switch (proposal.kind) {
        case "replace_meal": {
          const result = await replaceMeal(proposal.slot as MealId, proposal.foodId);
          return result.success
            ? { ok: true, text: `Done. ${result.message}` }
            : { ok: false, text: `I couldn't replace that meal. ${result.message} Nothing was changed.` };
        }
        case "log_food": {
          const mealId = proposal.mealId as MealId;
          if (!(mealId in profile.foodIntake)) {
            return { ok: false, text: "I couldn't find that meal slot. Nothing was changed." };
          }
          updateMeal(mealId, { hasMeal: true });
          const itemId = addFoodItem(mealId);
          updateFoodItem(mealId, itemId, { name: proposal.foodName });
          return {
            ok: true,
            text: `Done. ${proposal.foodName} was added to your ${mealId
              .replace(/([A-Z])/g, " $1")
              .toLowerCase()}. Save your profile to keep it.`,
          };
        }
        case "add_water": {
          updateWaterIntake({ litresPerDay: proposal.newTotalLitres, sourceUnit: "litres" });
          return {
            ok: true,
            text: `Done. Your water intake is now ${proposal.newTotalLitres} L today. Save your profile to keep it.`,
          };
        }
        default:
          return { ok: false, text: "I don't know how to perform that action." };
      }
    },
    [replaceMeal, profile.foodIntake, updateMeal, addFoodItem, updateFoodItem, updateWaterIntake],
  );

  const confirmAction = useCallback(
    (messageId: string) => {
      const message = messages.find((m) => m.id === messageId);
      if (!message?.action) return;
      const proposal = message.action.proposal;

      // Remove the pending card immediately to prevent double-confirmation.
      setPendingAction(null);
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, action: undefined } : m)),
      );

      void executeProposal(proposal).then((outcome) => {
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: "assistant",
            text: outcome.text,
            timestamp: new Date().toISOString(),
          },
        ]);
      });
    },
    [messages, executeProposal],
  );

  const cancelAction = useCallback((messageId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, action: undefined } : m,
      ),
    );
    setPendingAction(null);
  }, []);

  /* -------------------- voice -------------------- */

  const startListening = useCallback(() => {
    if (!voice.supported) {
      setVoice((v) => ({
        ...v,
        error: "Voice input is not supported in this browser.",
      }));
      return;
    }

    const SpeechRecognitionClass =
      (window as unknown as { SpeechRecognition?: SpeechRecognitionCtor })
        .SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionCtor })
        .webkitSpeechRecognition;

    if (!SpeechRecognitionClass) return;

    const recognition: SpeechRecognitionInstance = new SpeechRecognitionClass();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () =>
      setVoice((v) => ({ ...v, listening: true, error: null }));

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

    recognition.onend = () =>
      setVoice((v) => ({ ...v, listening: false, transcript: "" }));

    recognitionRef.current = recognition;
    recognition.start();
  }, [voice.supported, sendMessage]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setVoice((v) => ({ ...v, listening: false }));
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!voiceEnabled || typeof window === "undefined" || !window.speechSynthesis)
        return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text.slice(0, 500));
      utterance.rate = 1;
      utterance.pitch = 1;
      // Speaking state follows the synthesiser's own events (external
      // system), so it stays accurate even if playback is refused.
      utterance.onstart = () => setVoice((v) => ({ ...v, speaking: true }));
      utterance.onend = () => setVoice((v) => ({ ...v, speaking: false }));
      utterance.onerror = () => setVoice((v) => ({ ...v, speaking: false }));
      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [voiceEnabled],
  );

  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setVoice((v) => ({ ...v, speaking: false }));
  }, []);

  // Auto-speak the latest assistant message when voice output is enabled.
  // This is a side effect (speech synthesis), so it runs in an effect —
  // never during render.
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
      sendMessage,
      clearConversation,
      memory,
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
      processing,
    }),
    [
      messages,
      sendMessage,
      clearConversation,
      memory,
      voice,
      startListening,
      stopListening,
      speak,
      stopSpeaking,
      voiceEnabled,
      pendingAction,
      confirmAction,
      cancelAction,
      processing,
    ],
  );

  return (
    <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>
  );
}

export function useAssistant() {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error("useAssistant must be used within AssistantProvider");
  return ctx;
}
