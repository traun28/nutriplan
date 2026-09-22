/**
 * Phase 3 — 7-day personalised meal planner.
 *
 * This module is a thin orchestration layer over the existing Part 7
 * engine. Every day of the week is a full `DietPlan` produced by
 * `generateDietPlan`, so:
 *
 *   • targets come from the same processed profile (one calorie system);
 *   • restriction filtering, portion sizing, balancing and the independent
 *     safety validator are the very same functions used for the daily plan;
 *   • meal replacement reuses `replaceMealInPlan`, which re-validates the
 *     whole day before accepting the swap.
 *
 * What is new here is purely cross-day: variety exclusions between days,
 * per-day regeneration scopes, ranked/labelled alternatives, serving-size
 * updates, and the weekly summary. Nothing in this file invents nutrition
 * values — every number is summed from planned items that were scaled by
 * `buildPlannedItem`.
 */
import type {
  DietPlan,
  FoodItemRecord,
  PlannedMeal,
  ProcessedProfile,
  UserProfile,
} from "@/types/profile";
import { FOOD_BY_ID, FOOD_DATABASE } from "@/data/foods/foodDatabase";
import { DIETARY_TYPES, labelFor } from "@/data/options";
import { roundTo } from "@/lib/numbers";
import {
  PLAN_TOLERANCES,
  PREP_TIME_LIMITS,
  SLOT_CATEGORY,
  SLOT_ORDER,
  type PlannerSlot,
} from "@/services/diet/config";
import {
  buildPlannedItem,
  chooseServings,
  generateDietPlan,
  mealFromItems,
} from "@/services/diet/dietGenerator";
import { filterFoods, foodsForCategory } from "@/services/diet/filters";
import { validateGeneratedDietPlan } from "@/services/diet/planValidator";
import { replaceMealInPlan } from "@/services/diet/replaceMeal";
import { collectHabitFoods, scoreFood } from "@/services/diet/scoring";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export const WEEKLY_PLAN_VERSION = 1;
export const DAYS_PER_WEEK = 7;
export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Budget is a *priority* over existing food tags — the database has no prices. */
export type BudgetLevel = "low" | "medium" | "high";
export const BUDGET_LEVELS: { id: BudgetLevel; label: string; hint: string }[] = [
  { id: "low", label: "Low", hint: "Prioritises foods tagged budget-friendly." },
  { id: "medium", label: "Medium", hint: "No cost preference applied." },
  { id: "high", label: "High", hint: "No cost preference applied." },
];

export interface WeeklyPlanDay {
  /** 0-based position, Day 1 = 0. */
  dayIndex: number;
  /** "Day 1" … "Day 7". */
  label: string;
  /** Short weekday name; derived from `date` when a start date is set. */
  weekday: string;
  /** "YYYY-MM-DD" when the plan is anchored to a start date, else null. */
  date: string | null;
  plan: DietPlan;
}

export interface WeeklySummary {
  averageCalories: number;
  averageProtein: number;
  averageCarbohydrates: number;
  averageFat: number;
  /** The food database carries no fibre values, so this is always null. */
  averageFiber: number | null;
  mealCount: number;
  daysOnCalorieTarget: number;
}

export interface WeeklyTargets {
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
}

export interface WeeklyPlanData {
  version: number;
  days: WeeklyPlanDay[];
  summary: WeeklySummary;
  targets: WeeklyTargets;
  options: { budget: BudgetLevel | null };
  provenance: {
    sourceProfileId: string;
    sourceProfileUpdatedAt: string;
    processedAt: string;
    generatedAt: string;
    engine: string;
  };
}

/** A persisted plan as returned by the API. */
export interface WeeklyPlanRecord {
  id: number;
  name: string;
  startDate: string | null;
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
  data: WeeklyPlanData;
}

/** Lightweight row for the saved-plans list. */
export interface WeeklyPlanListItem {
  id: number;
  name: string;
  startDate: string | null;
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
  summary: WeeklySummary;
}

export type WeeklyFailureReason =
  | "PROFILE_INCOMPLETE"
  | "TARGETS_UNAVAILABLE"
  | "INSUFFICIENT_OPTIONS"
  | "VALIDATION_FAILED";

export type WeeklyResult<T> =
  | { success: true; data: T }
  | { success: false; reason: WeeklyFailureReason; message: string; details: string[] };

export interface GenerateWeeklyOptions {
  budget?: BudgetLevel | null;
  startDate?: string | null;
  /** Deterministic seed for tests; omitted in production. */
  baseSeed?: number;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function preferTagsFor(budget: BudgetLevel | null | undefined): string[] {
  return budget === "low" ? ["budget"] : [];
}

function mainFoodIds(plan: DietPlan): string[] {
  return plan.meals.flatMap((meal) => meal.items.map((item) => item.foodId));
}

function isPlannerSlot(value: unknown): value is PlannerSlot {
  return typeof value === "string" && (SLOT_ORDER as string[]).includes(value);
}

export function parseSlot(value: unknown): PlannerSlot | null {
  return isPlannerSlot(value) ? value : null;
}

export function parseDayIndex(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isInteger(n) && (n as number) >= 0 && (n as number) < DAYS_PER_WEEK
    ? (n as number)
    : null;
}

function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function shiftDate(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

function weekdayOf(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sun
  return WEEKDAY_SHORT[(dow + 6) % 7];
}

/** Builds the label/weekday/date envelope for a day. */
function dayEnvelope(dayIndex: number, startDate: string | null, plan: DietPlan): WeeklyPlanDay {
  const date = startDate ? shiftDate(startDate, dayIndex) : null;
  return {
    dayIndex,
    label: `Day ${dayIndex + 1}`,
    weekday: date ? weekdayOf(date) : WEEKDAY_SHORT[dayIndex],
    date,
    plan,
  };
}

/** Re-labels every day after a start-date change. */
export function relabelDays(days: WeeklyPlanDay[], startDate: string | null): WeeklyPlanDay[] {
  return days.map((day) => dayEnvelope(day.dayIndex, startDate, day.plan));
}

/**
 * Which day of the plan corresponds to a calendar date.
 * Anchored plans map by offset from the start date; un-anchored plans use
 * Day 1 = Monday. Returns null when the date is outside an anchored week.
 */
export function dayIndexForDate(startDate: string | null, dateKey: string): number | null {
  if (startDate) {
    const [sy, sm, sd] = startDate.split("-").map(Number);
    const [y, m, d] = dateKey.split("-").map(Number);
    const diff = Math.round(
      (Date.UTC(y, m - 1, d) - Date.UTC(sy, sm - 1, sd)) / 86_400_000,
    );
    return diff >= 0 && diff < DAYS_PER_WEEK ? diff : null;
  }
  const [y, m, d] = dateKey.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return (dow + 6) % 7;
}

export function summarise(days: WeeklyPlanDay[], targets: WeeklyTargets): WeeklySummary {
  const n = days.length || 1;
  const sum = (pick: (plan: DietPlan) => number) =>
    days.reduce((total, day) => total + pick(day.plan), 0);
  const tolerance = targets.calories * PLAN_TOLERANCES.caloriePercent;
  return {
    averageCalories: Math.round(sum((p) => p.dailyTotals.calories) / n),
    averageProtein: roundTo(sum((p) => p.dailyTotals.protein) / n, 1),
    averageCarbohydrates: roundTo(sum((p) => p.dailyTotals.carbohydrates) / n, 1),
    averageFat: roundTo(sum((p) => p.dailyTotals.fat) / n, 1),
    averageFiber: null,
    mealCount: days.reduce((total, day) => total + day.plan.meals.length, 0),
    daysOnCalorieTarget: days.filter(
      (day) => Math.abs(day.plan.dailyTotals.calories - targets.calories) <= tolerance,
    ).length,
  };
}

function targetsFrom(plan: DietPlan): WeeklyTargets {
  return {
    calories: plan.summary.targetCalories,
    protein: plan.summary.targetProtein,
    carbohydrates: plan.summary.targetCarbohydrates,
    fat: plan.summary.targetFat,
  };
}

/** Returns a copy of `data` with one day swapped and the summary recomputed. */
function withDay(data: WeeklyPlanData, dayIndex: number, plan: DietPlan): WeeklyPlanData {
  const days = data.days.map((day) =>
    day.dayIndex === dayIndex ? { ...day, plan } : day,
  );
  return { ...data, days, summary: summarise(days, data.targets) };
}

function failureFrom(
  result: { reason: WeeklyFailureReason; message: string; details: string[] },
): WeeklyResult<never> {
  return { success: false, reason: result.reason, message: result.message, details: result.details };
}

/* ------------------------------------------------------------------ */
/* Day generation with cross-day variety                               */
/* ------------------------------------------------------------------ */

/**
 * Generates one day, first avoiding foods used on the neighbouring days,
 * then relaxing the exclusion if the food database cannot support it.
 * Relaxing variety is safe; relaxing restrictions never happens.
 */
function generateDay(
  profile: UserProfile,
  processed: ProcessedProfile,
  seed: number,
  avoid: string[][],
  preferTags: string[],
) {
  const attempts = [avoid.flat(), avoid[0] ?? [], []];
  let last: ReturnType<typeof generateDietPlan> | null = null;
  for (const excludeFoodIds of attempts) {
    const result = generateDietPlan(profile, processed, {
      variationSeed: seed,
      excludeFoodIds: Array.from(new Set(excludeFoodIds)),
      preferTags,
    });
    if (result.success) return result;
    last = result;
    if (result.reason !== "INSUFFICIENT_OPTIONS" && result.reason !== "VALIDATION_FAILED") {
      return result;
    }
  }
  return last!;
}

export function generateWeeklyPlan(
  profile: UserProfile,
  processed: ProcessedProfile | null,
  options: GenerateWeeklyOptions = {},
): WeeklyResult<WeeklyPlanData> {
  if (!processed) {
    return {
      success: false,
      reason: "TARGETS_UNAVAILABLE",
      message: "Your nutrition targets have not been calculated yet.",
      details: [],
    };
  }
  const startDate = options.startDate && isDateKey(options.startDate) ? options.startDate : null;
  const budget = options.budget ?? null;
  const preferTags = preferTagsFor(budget);
  const baseSeed = options.baseSeed ?? Math.floor(Math.random() * 1_000_000) + 1;

  const plans: DietPlan[] = [];
  for (let i = 0; i < DAYS_PER_WEEK; i += 1) {
    const avoid = [plans[i - 1], plans[i - 2]].filter(Boolean).map((p) => mainFoodIds(p!));
    const result = generateDay(profile, processed, baseSeed + i * 104_729, avoid, preferTags);
    if (!result.success) return failureFrom(result);
    plans.push(result.plan);
  }

  const targets = targetsFrom(plans[0]);
  const days = plans.map((plan, i) => dayEnvelope(i, startDate, plan));
  return {
    success: true,
    data: {
      version: WEEKLY_PLAN_VERSION,
      days,
      summary: summarise(days, targets),
      targets,
      options: { budget },
      provenance: {
        sourceProfileId: profile.profileId,
        sourceProfileUpdatedAt: profile.updatedAt ?? "",
        processedAt: processed.processedAt,
        generatedAt: new Date().toISOString(),
        engine: "rule-based diet engine (Part 7) × 7 days",
      },
    },
  };
}

/** Regenerates a single day; the other six days are returned untouched. */
export function regenerateWeeklyDay(
  data: WeeklyPlanData,
  profile: UserProfile,
  processed: ProcessedProfile | null,
  dayIndex: number,
): WeeklyResult<WeeklyPlanData> {
  if (!processed) {
    return { success: false, reason: "TARGETS_UNAVAILABLE", message: "Your nutrition targets are not available.", details: [] };
  }
  const current = data.days.find((d) => d.dayIndex === dayIndex);
  if (!current) {
    return { success: false, reason: "VALIDATION_FAILED", message: "That day is not part of this plan.", details: [] };
  }
  const neighbours = data.days
    .filter((d) => Math.abs(d.dayIndex - dayIndex) === 1)
    .map((d) => mainFoodIds(d.plan));
  // Also avoid what the day currently has, so "regenerate" visibly changes it.
  const avoid = [mainFoodIds(current.plan), ...neighbours];
  const result = generateDay(
    profile,
    processed,
    Math.floor(Math.random() * 1_000_000) + 1,
    avoid,
    preferTagsFor(data.options.budget),
  );
  if (!result.success) return failureFrom(result);
  return { success: true, data: withDay(data, dayIndex, result.plan) };
}

/* ------------------------------------------------------------------ */
/* Alternatives, labels and replacement                                */
/* ------------------------------------------------------------------ */

export interface MealAlternative {
  foodId: string;
  name: string;
  servings: number;
  portionLabel: string;
  calories: number;
  proteinGrams: number;
  carbohydrateGrams: number;
  fatGrams: number;
  preparationTimeMinutes: number;
  /** Computed from the actual comparison with the current meal. */
  labels: string[];
  /** Factual sentence, e.g. "About 40 kcal fewer and 6 g more protein than Poha." */
  explanation: string;
}

function signed(value: number, unit: string): string {
  const rounded = Math.round(value);
  if (rounded === 0) return `about the same ${unit}`;
  return `${Math.abs(rounded)} ${unit} ${rounded > 0 ? "more" : "fewer"}`;
}

/** Builds the label set by comparing a scaled candidate with the current meal. */
export function describeAlternative(
  candidate: { calories: number; proteinGrams: number; carbohydrateGrams: number; fatGrams: number },
  food: FoodItemRecord,
  current: PlannedMeal,
  profile: UserProfile,
): { labels: string[]; explanation: string } {
  const labels: string[] = [];
  const kcalDelta = candidate.calories - current.calories;
  const proteinDelta = candidate.proteinGrams - current.proteinGrams;
  const kcalTolerance = Math.max(40, current.calories * 0.1);

  if (Math.abs(kcalDelta) <= kcalTolerance) labels.push("Similar calories");
  else if (kcalDelta < 0) labels.push("Lower calories");
  else labels.push("Higher calories");

  if (proteinDelta >= 5 && proteinDelta >= current.proteinGrams * 0.15) labels.push("More protein");
  else if (proteinDelta <= -5 && Math.abs(proteinDelta) >= current.proteinGrams * 0.15) labels.push("Less protein");

  const limit = PREP_TIME_LIMITS[profile.practicalConstraints.mealPreparationTime] ?? null;
  if (limit !== null && food.preparationTimeMinutes <= limit && food.preparationTimeMinutes < current.preparationTimeMinutes) {
    labels.push("Quicker to prepare");
  }

  const dietaryType = profile.dietaryPreferences.dietaryType;
  if (dietaryType && food.dietaryTypes.includes(dietaryType)) {
    labels.push(labelFor(DIETARY_TYPES, dietaryType));
  }
  if (profile.dietaryPreferences.preferredCuisines.some((c) => food.cuisines.includes(c))) {
    labels.push("Preferred cuisine");
  }
  if (food.tags.includes("budget")) labels.push("Budget-friendly");

  const explanation = `Compared with ${current.name}: ${signed(kcalDelta, "kcal")}, ${signed(
    proteinDelta,
    "g protein",
  )}, ${signed(candidate.carbohydrateGrams - current.carbohydrateGrams, "g carbs")}, ${signed(
    candidate.fatGrams - current.fatGrams,
    "g fat",
  )}.`;
  return { labels, explanation };
}

/**
 * Ranked, labelled alternatives for one slot of one day. Candidates pass
 * the same restriction filters as generation, are scored with the same
 * scoring function, and are scaled to the slot's calorie budget so the
 * numbers shown are the numbers that would be applied.
 */
export function rankAlternatives(
  dayPlan: DietPlan,
  profile: UserProfile,
  slot: PlannerSlot,
  options: { limit?: number; excludeFoodIds?: string[]; preferTags?: string[] } = {},
): MealAlternative[] {
  const current = dayPlan.meals.find((m) => m.type === slot);
  if (!current) return [];
  const limit = options.limit ?? 6;
  const exclude = new Set([...current.items.map((i) => i.foodId), ...(options.excludeFoodIds ?? [])]);
  const { allowed } = filterFoods(FOOD_DATABASE, profile);
  let candidates = foodsForCategory(allowed, SLOT_CATEGORY[slot]).filter((f) => !exclude.has(f.id));
  if (candidates.length === 0) {
    // Relax only the cross-day variety exclusion, never the safety filters.
    const currentIds = new Set(current.items.map((i) => i.foodId));
    candidates = foodsForCategory(allowed, SLOT_CATEGORY[slot]).filter((f) => !currentIds.has(f.id));
  }

  const slotCalories = dayPlan.summary.targetCalories * (current.targetShare || 0.3);
  const slotProtein = dayPlan.summary.targetProtein * (current.targetShare || 0.3);
  const usedFoodIds = new Set(
    dayPlan.meals.filter((m) => m.type !== slot).flatMap((m) => m.items.map((i) => i.foodId)),
  );
  const usedIngredients = new Set(
    dayPlan.meals.filter((m) => m.type !== slot).flatMap((m) => m.items.flatMap((i) => i.ingredients)),
  );
  const habitFoods = collectHabitFoods(profile);
  const preferTags = options.preferTags ?? [];

  return candidates
    .map((food) => {
      const score = scoreFood(food, {
        slotCalories,
        slotProtein,
        profile,
        habitFoods,
        usedFoodIds,
        usedIngredients,
      }).total;
      const boost = preferTags.some((t) => food.tags.includes(t)) ? 0.06 : 0;
      return { food, score: score + boost };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ food }) => {
      const servings = chooseServings(food, slotCalories);
      const item = buildPlannedItem(food, servings);
      const { labels, explanation } = describeAlternative(item, food, current, profile);
      return {
        foodId: food.id,
        name: food.name,
        servings,
        portionLabel: item.portionLabel,
        calories: item.calories,
        proteinGrams: item.proteinGrams,
        carbohydrateGrams: item.carbohydrateGrams,
        fatGrams: item.fatGrams,
        preparationTimeMinutes: food.preparationTimeMinutes,
        labels,
        explanation,
      };
    });
}

/** Food ids used in the same slot on the other days (cross-day variety). */
function sameSlotElsewhere(data: WeeklyPlanData, dayIndex: number, slot: PlannerSlot): string[] {
  return data.days
    .filter((d) => d.dayIndex !== dayIndex)
    .flatMap((d) => d.plan.meals.filter((m) => m.type === slot).flatMap((m) => m.items.map((i) => i.foodId)));
}

export function alternativesFor(
  data: WeeklyPlanData,
  profile: UserProfile,
  dayIndex: number,
  slot: PlannerSlot,
  limit = 6,
): MealAlternative[] {
  const day = data.days.find((d) => d.dayIndex === dayIndex);
  if (!day) return [];
  return rankAlternatives(day.plan, profile, slot, {
    limit,
    excludeFoodIds: sameSlotElsewhere(data, dayIndex, slot),
    preferTags: preferTagsFor(data.options.budget),
  });
}

/** Applies a replacement; the swapped day is re-validated before it is accepted. */
export function replaceWeeklyMeal(
  data: WeeklyPlanData,
  profile: UserProfile,
  dayIndex: number,
  slot: PlannerSlot,
  foodId: string,
): WeeklyResult<{ data: WeeklyPlanData; previousName: string; newName: string }> {
  const day = data.days.find((d) => d.dayIndex === dayIndex);
  if (!day) {
    return { success: false, reason: "VALIDATION_FAILED", message: "That day is not part of this plan.", details: [] };
  }
  const result = replaceMealInPlan(day.plan, profile, slot, foodId);
  if (!result.success) {
    return { success: false, reason: "VALIDATION_FAILED", message: result.message, details: [] };
  }
  return {
    success: true,
    data: {
      data: withDay(data, dayIndex, result.plan),
      previousName: result.previousName,
      newName: result.replacedWith.name,
    },
  };
}

/** "Regenerate meal": picks a fresh, top-ranked alternative and applies it. */
export function regenerateWeeklyMeal(
  data: WeeklyPlanData,
  profile: UserProfile,
  dayIndex: number,
  slot: PlannerSlot,
): WeeklyResult<{ data: WeeklyPlanData; previousName: string; newName: string }> {
  const options = alternativesFor(data, profile, dayIndex, slot, 4);
  if (options.length === 0) {
    return {
      success: false,
      reason: "INSUFFICIENT_OPTIONS",
      message: "No other compatible option exists for this meal with your current restrictions.",
      details: [],
    };
  }
  // Try the small top pool in random order so repeated clicks vary, but
  // never accept an option that fails validation.
  const shuffled = [...options].sort(() => Math.random() - 0.5);
  let lastMessage = "";
  for (const option of shuffled) {
    const applied = replaceWeeklyMeal(data, profile, dayIndex, slot, option.foodId);
    if (applied.success) return applied;
    lastMessage = applied.message;
  }
  return { success: false, reason: "VALIDATION_FAILED", message: lastMessage || "The meal could not be regenerated.", details: [] };
}

/* ------------------------------------------------------------------ */
/* Serving-size updates                                                */
/* ------------------------------------------------------------------ */

export const WEEKLY_SERVINGS_MIN = 0.25;
export const WEEKLY_SERVINGS_MAX = 5;

/** Re-scales one item through the engine's own portion builder. */
export function updateWeeklyServings(
  data: WeeklyPlanData,
  profile: UserProfile,
  dayIndex: number,
  slot: PlannerSlot,
  foodId: string,
  servings: number,
): WeeklyResult<WeeklyPlanData> {
  if (!Number.isFinite(servings) || servings < WEEKLY_SERVINGS_MIN || servings > WEEKLY_SERVINGS_MAX) {
    return {
      success: false,
      reason: "VALIDATION_FAILED",
      message: `Servings must be between ${WEEKLY_SERVINGS_MIN} and ${WEEKLY_SERVINGS_MAX}.`,
      details: [],
    };
  }
  const day = data.days.find((d) => d.dayIndex === dayIndex);
  const meal = day?.plan.meals.find((m) => m.type === slot);
  if (!day || !meal || !meal.items.some((i) => i.foodId === foodId)) {
    return { success: false, reason: "VALIDATION_FAILED", message: "That meal item was not found in the plan.", details: [] };
  }
  const food = FOOD_BY_ID.get(foodId);
  if (!food) {
    return { success: false, reason: "VALIDATION_FAILED", message: "That food is no longer in the database.", details: [] };
  }
  const rounded = roundTo(servings, 2);
  const items = meal.items.map((item) => (item.foodId === foodId ? buildPlannedItem(food, rounded) : item));
  const newMeal = mealFromItems(slot, items, meal.time, meal.targetShare, meal.notes);
  const meals = day.plan.meals.map((m) => (m.type === slot ? newMeal : m));
  const candidate: DietPlan = {
    ...day.plan,
    meals,
    dailyTotals: {
      calories: Math.round(meals.reduce((s, m) => s + m.calories, 0)),
      protein: roundTo(meals.reduce((s, m) => s + m.proteinGrams, 0), 1),
      carbohydrates: roundTo(meals.reduce((s, m) => s + m.carbohydrateGrams, 0), 1),
      fat: roundTo(meals.reduce((s, m) => s + m.fatGrams, 0), 1),
    },
  };
  // Portion changes are the user's choice, so calorie-tolerance warnings are
  // allowed — but restriction failures still block the change.
  const validation = validateGeneratedDietPlan(candidate, profile);
  const restrictionErrors = validation.errors.filter((e) => !/calorie|portion/i.test(e));
  if (restrictionErrors.length > 0) {
    return { success: false, reason: "VALIDATION_FAILED", message: restrictionErrors[0], details: [] };
  }
  candidate.validation = { ...day.plan.validation, warnings: validation.warnings, checks: validation.checks };
  return { success: true, data: withDay(data, dayIndex, candidate) };
}

/* ------------------------------------------------------------------ */
/* Whole-plan validation (run before every save)                       */
/* ------------------------------------------------------------------ */

/**
 * Independent structural + safety check of a weekly plan: every food must
 * exist, every quantity must be a sane finite number, nutrition must be
 * present, and each day must pass the restriction validator.
 */
export function validateWeeklyPlanData(
  data: WeeklyPlanData,
  profile: UserProfile,
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!Array.isArray(data.days) || data.days.length !== DAYS_PER_WEEK) {
    errors.push("A weekly plan must contain exactly 7 days.");
    return { isValid: false, errors };
  }
  for (const day of data.days) {
    if (!day.plan || !Array.isArray(day.plan.meals) || day.plan.meals.length === 0) {
      errors.push(`${day.label} has no meals.`);
      continue;
    }
    for (const meal of day.plan.meals) {
      for (const item of meal.items) {
        const food = FOOD_BY_ID.get(item.foodId);
        if (!food) errors.push(`${day.label} ${meal.label}: "${item.name}" is not in the food database.`);
        if (!Number.isFinite(item.servings) || item.servings <= 0 || item.servings > WEEKLY_SERVINGS_MAX) {
          errors.push(`${day.label} ${meal.label}: invalid quantity for ${item.name}.`);
        }
        for (const key of ["calories", "proteinGrams", "carbohydrateGrams", "fatGrams"] as const) {
          if (!Number.isFinite(item[key]) || item[key] < 0) {
            errors.push(`${day.label} ${meal.label}: nutrition unavailable for ${item.name}.`);
            break;
          }
        }
      }
    }
    const validation = validateGeneratedDietPlan(day.plan, profile);
    const restrictionErrors = validation.errors.filter((e) => !/calorie|portion/i.test(e));
    restrictionErrors.forEach((e) => errors.push(`${day.label}: ${e}`));
  }
  return { isValid: errors.length === 0, errors };
}
