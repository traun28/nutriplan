/**
 * Phase 6 — shared assistant types (safe to import from client code).
 *
 * Everything the assistant returns is a plain, serialisable structure so
 * the UI can render cards and buttons without ever executing anything the
 * model produced. Actions are fixed shapes that the server re-validates.
 */
import type { MealId } from "@/types/profile";

export type DataSourceLabel = "Logged" | "Planned" | "Calculated" | "Estimated" | "Reference" | "General";

/** A structured action the user can confirm. Only these shapes exist. */
export type AssistantAction =
  | { type: "navigate"; label: string; href: string }
  | { type: "log_food"; label: string; foodId: string; foodName: string; servings: number; mealType: MealId; logDate: string }
  | { type: "replace_meal"; label: string; planId: number; dayIndex: number; slot: Exclude<MealId, "otherSnacks">; foodId: string; foodName: string }
  | { type: "add_water"; label: string; amountMl: number; logDate: string };

export type ActionType = AssistantAction["type"];

export interface FoodCard {
  kind: "food";
  foodId: string;
  name: string;
  servings: number;
  portionLabel: string;
  calories: number;
  proteinGrams: number;
  carbohydrateGrams: number;
  fatGrams: number;
  prepMinutes: number;
  /** Factual reason drawn from data ("fits your remaining 480 kcal"). */
  reason: string;
  labels: string[];
  actions: AssistantAction[];
}

export interface RecipeCard {
  kind: "recipe";
  recipeId: string;
  name: string;
  calories: number;
  proteinGrams: number;
  prepMinutes: number;
  matched: string[];
  missing: string[];
  hasDetail: boolean;
  actions: AssistantAction[];
}

export interface StatCard {
  kind: "stats";
  title: string;
  rows: { label: string; value: string; hint?: string }[];
  source: DataSourceLabel;
}

export type AssistantCard = FoodCard | RecipeCard | StatCard;

export interface AssistantReply {
  text: string;
  /** "general" = educational, no user data; "personal" = built from the user's records. */
  scope: "general" | "personal";
  sources: DataSourceLabel[];
  cards: AssistantCard[];
  actions: AssistantAction[];
  /** True when the prose came from the configured AI provider. */
  aiGenerated: boolean;
  /** Short follow-up prompts relevant to this answer. */
  followUps: string[];
}

export interface AssistantMessageRecord {
  id: number;
  role: "user" | "assistant";
  content: string;
  payload: Omit<AssistantReply, "text"> | null;
  createdAt: string;
}

export interface ConversationSummary {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface Recommendation {
  id: string;
  category: "meal" | "swap" | "recipe" | "nutrition" | "grocery" | "plan" | "water";
  title: string;
  detail: string;
  reason: string;
  source: DataSourceLabel;
  /** Prompt to send to the assistant, or a direct navigation. */
  prompt?: string;
  href?: string;
  cta: string;
}

/** Quick prompts rendered as chips; every one maps to a real intent. */
export const SUGGESTION_CHIPS: { label: string; prompt: string }[] = [
  { label: "Plan today's meals", prompt: "Plan today's meals" },
  { label: "Suggest dinner", prompt: "Suggest dinner" },
  { label: "Analyze my nutrition", prompt: "Explain my nutrition today" },
  { label: "Use my pantry", prompt: "What can I make with my pantry?" },
  { label: "Replace a meal", prompt: "Replace today's lunch" },
  { label: "Show recipes", prompt: "Show me recipes" },
  { label: "What's left today?", prompt: "What is left in my calorie target today?" },
  { label: "Weekly report", prompt: "Explain my weekly nutrition" },
];
