/**
 * Phase 5 — pure nutrition analysis over existing data.
 *
 * Inputs are always the stored records (food-log entries, water entries,
 * the Part 6 targets, the Phase 3 plan day). Nothing here calculates
 * nutrition from scratch — entries carry the snapshot taken when they
 * were logged, and targets come from `targetsFromProcessed`.
 *
 * Vocabulary used throughout the UI:
 *   target    — the user's configured daily target (Part 6)
 *   estimated — totals of the logged entries ("estimated intake")
 *   planned   — what the Phase 3 plan scheduled
 *   reference — a documented non-personal reference (fibre only)
 */
import type { FoodItemRecord, UserProfile } from "@/types/profile";
import type { DailyTargets, DailyTotals, FoodLogEntry, WaterEntry } from "@/services/foodLog/types";
import { sumEntries } from "@/services/foodLog/calculations";
import { foodLogMealLabel } from "@/services/foodLog/types";
import { FOOD_DATABASE } from "@/data/foods/foodDatabase";
import { filterFoods } from "@/services/diet/filters";
import { roundTo } from "@/lib/numbers";

export type NutrientKey = "calories" | "protein" | "carbohydrates" | "fat" | "fiber";

export const NUTRIENTS: { key: NutrientKey; label: string; unit: string }[] = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "protein", label: "Protein", unit: "g" },
  { key: "carbohydrates", label: "Carbohydrates", unit: "g" },
  { key: "fat", label: "Fat", unit: "g" },
  { key: "fiber", label: "Fibre", unit: "g" },
];

/** Within ±10 % of target counts as "on target". Documented for the score card. */
export const ON_TARGET_TOLERANCE = 0.1;

export type GapStatus = "gap" | "on_target" | "excess" | "no_target" | "no_data";

export interface NutrientAssessment {
  key: NutrientKey;
  label: string;
  unit: string;
  /** Estimated intake from logged entries; null when no entry carries the value (fibre). */
  estimated: number | null;
  target: number | null;
  /** How the target was sourced — shown as a compact label. */
  targetSource: "target" | "reference" | null;
  /** target − estimated (positive = below target). */
  difference: number | null;
  percentOfTarget: number | null;
  status: GapStatus;
}

export interface MealContribution {
  mealType: string;
  mealLabel: string;
  amount: number;
  share: number; // 0..1
}

export interface FoodContribution {
  foodId: string;
  foodName: string;
  mealLabel: string;
  amount: number;
  share: number;
}

function valueOf(entry: Pick<FoodLogEntry, "calories" | "proteinGrams" | "carbohydrateGrams" | "fatGrams" | "fiberGrams">, key: NutrientKey): number | null {
  switch (key) {
    case "calories":
      return entry.calories;
    case "protein":
      return entry.proteinGrams;
    case "carbohydrates":
      return entry.carbohydrateGrams;
    case "fat":
      return entry.fatGrams;
    case "fiber":
      return entry.fiberGrams;
  }
}

function totalOf(totals: DailyTotals, key: NutrientKey): number | null {
  return key === "fiber" ? totals.fiber : totals[key];
}

export function assessNutrients(totals: DailyTotals, targets: DailyTargets, hasEntries: boolean): NutrientAssessment[] {
  return NUTRIENTS.map(({ key, label, unit }) => {
    const estimated = totalOf(totals, key);
    // Fibre has no personal target in the Part 6 engine and the food database
    // carries no fibre values, so it is always "no data" — never invented.
    const target = key === "fiber" ? null : targets[key];
    const targetSource: NutrientAssessment["targetSource"] = target === null ? null : "target";
    let status: GapStatus;
    if (!hasEntries || estimated === null) status = "no_data";
    else if (target === null || target <= 0) status = "no_target";
    else {
      const ratio = estimated / target;
      status = ratio < 1 - ON_TARGET_TOLERANCE ? "gap" : ratio > 1 + ON_TARGET_TOLERANCE ? "excess" : "on_target";
    }
    const difference = target !== null && estimated !== null ? roundTo(target - estimated, 1) : null;
    const percentOfTarget = target && estimated !== null ? Math.round((estimated / target) * 100) : null;
    return { key, label, unit, estimated, target, targetSource, difference, percentOfTarget, status };
  });
}

/** Which meals a nutrient came from, largest first. */
export function mealContributions(entries: FoodLogEntry[], key: NutrientKey): MealContribution[] {
  const byMeal = new Map<string, number>();
  let total = 0;
  for (const entry of entries) {
    const v = valueOf(entry, key);
    if (v === null) continue;
    byMeal.set(entry.mealType, (byMeal.get(entry.mealType) ?? 0) + v);
    total += v;
  }
  return Array.from(byMeal.entries())
    .map(([mealType, amount]) => ({ mealType, mealLabel: foodLogMealLabel(mealType), amount: roundTo(amount, 1), share: total > 0 ? amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

/** Which logged foods a nutrient came from, largest first (same food logged twice is merged). */
export function foodContributions(entries: FoodLogEntry[], key: NutrientKey, limit = 6): FoodContribution[] {
  const byFood = new Map<string, FoodContribution>();
  let total = 0;
  for (const entry of entries) {
    const v = valueOf(entry, key);
    if (v === null) continue;
    total += v;
    const existing = byFood.get(entry.foodId);
    if (existing) existing.amount += v;
    else byFood.set(entry.foodId, { foodId: entry.foodId, foodName: entry.foodName, mealLabel: foodLogMealLabel(entry.mealType), amount: v, share: 0 });
  }
  return Array.from(byFood.values())
    .map((c) => ({ ...c, amount: roundTo(c.amount, 1), share: total > 0 ? c.amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

/** One-sentence factual explanation of where a nutrient came from. */
export function explainSource(label: string, contributions: MealContribution[]): string | null {
  if (contributions.length === 0) return null;
  const top = contributions.slice(0, 2);
  const topShare = top.reduce((s, c) => s + c.share, 0);
  if (contributions.length === 1) return `All of today's ${label.toLowerCase()} came from ${top[0].mealLabel.toLowerCase()}.`;
  if (topShare >= 0.6) return `Most of today's ${label.toLowerCase()} came from ${top.map((c) => c.mealLabel.toLowerCase()).join(" and ")} (${Math.round(topShare * 100)}%).`;
  return `Today's ${label.toLowerCase()} was spread across ${contributions.length} meals; ${top[0].mealLabel.toLowerCase()} contributed the most (${Math.round(top[0].share * 100)}%).`;
}

/* ------------------------------------------------------------------ */
/* Food suggestions for a gap                                          */
/* ------------------------------------------------------------------ */

export interface GapSuggestion {
  foodId: string;
  name: string;
  category: string;
  /** Amount of the gap nutrient in one serving. */
  amount: number;
  calories: number;
  servingLabel: string;
}

function foodValue(food: FoodItemRecord, key: NutrientKey): number | null {
  switch (key) {
    case "calories":
      return food.calories;
    case "protein":
      return food.proteinGrams;
    case "carbohydrates":
      return food.carbohydrateGrams;
    case "fat":
      return food.fatGrams;
    case "fiber":
      return null;
  }
}

/**
 * Foods from the shared database that are high in the gap nutrient, pass
 * the user's restriction filters, and (when a calorie gap does not exist)
 * are not calorie-heavy relative to the nutrient they add.
 */
export function suggestFoodsForGap(key: NutrientKey, profile: UserProfile | null, options: { excludeFoodIds?: string[]; calorieRoom?: number | null; limit?: number } = {}): GapSuggestion[] {
  if (key === "fiber") return [];
  const allowed = profile ? filterFoods(FOOD_DATABASE, profile).allowed : FOOD_DATABASE;
  const exclude = new Set(options.excludeFoodIds ?? []);
  const limit = options.limit ?? 5;
  const room = options.calorieRoom ?? null;
  return allowed
    .filter((f) => !exclude.has(f.id))
    .map((f) => ({ food: f, amount: foodValue(f, key) ?? 0 }))
    .filter(({ food, amount }) => amount > 0 && (room === null || key === "calories" || food.calories <= Math.max(150, room)))
    .sort((a, b) => {
      // Density first (nutrient per kcal), then absolute amount.
      const da = key === "calories" ? a.amount : a.amount / Math.max(1, a.food.calories);
      const db = key === "calories" ? b.amount : b.amount / Math.max(1, b.food.calories);
      return db - da || b.amount - a.amount;
    })
    .slice(0, limit)
    .map(({ food, amount }) => ({
      foodId: food.id,
      name: food.name,
      category: food.category,
      amount: roundTo(amount, 1),
      calories: food.calories,
      servingLabel: `${food.servingSize.quantity} ${food.servingSize.unit}`,
    }));
}

/* ------------------------------------------------------------------ */
/* Daily score                                                         */
/* ------------------------------------------------------------------ */

export interface ScoreComponent {
  key: string;
  label: string;
  points: number;
  max: number;
  detail: string;
}

export interface DailyScore {
  total: number; // 0..100
  components: ScoreComponent[];
  /** False when targets are missing — the score is then not shown. */
  available: boolean;
}

function adherencePoints(estimated: number | null, target: number | null, max: number): { points: number; detail: string } {
  if (estimated === null || target === null || target <= 0) return { points: 0, detail: "No target available." };
  const ratio = estimated / target;
  const deviation = Math.abs(1 - ratio);
  // Full marks within ±10 %, linear to zero at ±50 %.
  const factor = deviation <= ON_TARGET_TOLERANCE ? 1 : Math.max(0, 1 - (deviation - ON_TARGET_TOLERANCE) / 0.4);
  return { points: Math.round(max * factor), detail: `${Math.round(ratio * 100)}% of target` };
}

/**
 * Transparent daily score (0–100):
 *   40 — calories within ±10 % of target (linear to 0 at ±50 %)
 *   25 — protein within ±10 % of target
 *   10 — carbohydrates within ±10 %
 *   10 — fat within ±10 %
 *   10 — planned meals logged (share of planned slots with an entry; 5 pts if no plan but ≥3 meals logged)
 *    5 — water target reached (pro-rata)
 * It is a data-completeness / target-adherence figure, not a health rating.
 */
export function computeDailyScore(input: { totals: DailyTotals; targets: DailyTargets; entries: FoodLogEntry[]; plannedSlots: string[] | null; waterMl: number; waterTargetMl: number }): DailyScore {
  const { totals, targets, entries, plannedSlots, waterMl, waterTargetMl } = input;
  if (targets.calories === null || entries.length === 0) {
    return { total: 0, components: [], available: false };
  }
  const cal = adherencePoints(totals.calories, targets.calories, 40);
  const pro = adherencePoints(totals.protein, targets.protein, 25);
  const carb = adherencePoints(totals.carbohydrates, targets.carbohydrates, 10);
  const fat = adherencePoints(totals.fat, targets.fat, 10);
  const loggedSlots = new Set<string>(entries.map((e) => e.mealType));
  let meals: ScoreComponent;
  if (plannedSlots && plannedSlots.length > 0) {
    const done = plannedSlots.filter((s) => loggedSlots.has(s)).length;
    meals = { key: "meals", label: "Planned meals logged", points: Math.round((10 * done) / plannedSlots.length), max: 10, detail: `${done} of ${plannedSlots.length} planned meals logged` };
  } else {
    meals = { key: "meals", label: "Meals logged", points: loggedSlots.size >= 3 ? 5 : Math.round((5 * loggedSlots.size) / 3), max: 10, detail: `${loggedSlots.size} meal slot${loggedSlots.size === 1 ? "" : "s"} logged (no plan for this day)` };
  }
  const waterFactor = waterTargetMl > 0 ? Math.min(1, waterMl / waterTargetMl) : 0;
  const water: ScoreComponent = { key: "water", label: "Water target", points: Math.round(5 * waterFactor), max: 5, detail: `${Math.round(waterFactor * 100)}% of water target` };
  const components: ScoreComponent[] = [
    { key: "calories", label: "Calories near target", points: cal.points, max: 40, detail: cal.detail },
    { key: "protein", label: "Protein near target", points: pro.points, max: 25, detail: pro.detail },
    { key: "carbohydrates", label: "Carbohydrates near target", points: carb.points, max: 10, detail: carb.detail },
    { key: "fat", label: "Fat near target", points: fat.points, max: 10, detail: fat.detail },
    meals,
    water,
  ];
  return { total: components.reduce((s, c) => s + c.points, 0), components, available: true };
}

/* ------------------------------------------------------------------ */
/* Planned vs actual                                                   */
/* ------------------------------------------------------------------ */

export interface PlannedVsActualMeal {
  slot: string;
  label: string;
  plannedName: string;
  planned: { calories: number; protein: number; carbohydrates: number; fat: number };
  /** Null when nothing was logged in that slot — "Not logged", never "skipped". */
  logged: { calories: number; protein: number; carbohydrates: number; fat: number; foods: string[] } | null;
}

export interface PlannedVsActual {
  meals: PlannedVsActualMeal[];
  plannedCount: number;
  loggedCount: number;
  loggingPercent: number;
  /** Slots logged that had no planned meal. */
  unplannedSlots: string[];
  planned: { calories: number; protein: number; carbohydrates: number; fat: number };
  actual: { calories: number; protein: number; carbohydrates: number; fat: number };
  difference: { calories: number; protein: number; carbohydrates: number; fat: number };
}

export function comparePlannedVsActual(plannedMeals: { type: string; label: string; name: string; calories: number; proteinGrams: number; carbohydrateGrams: number; fatGrams: number }[], entries: FoodLogEntry[]): PlannedVsActual {
  const bySlot = new Map<string, FoodLogEntry[]>();
  for (const e of entries) bySlot.set(e.mealType, [...(bySlot.get(e.mealType) ?? []), e]);
  const meals: PlannedVsActualMeal[] = plannedMeals.map((m) => {
    const logged = bySlot.get(m.type as FoodLogEntry["mealType"]);
    const t = logged ? sumEntries(logged) : null;
    return {
      slot: m.type,
      label: m.label,
      plannedName: m.name,
      planned: { calories: m.calories, protein: m.proteinGrams, carbohydrates: m.carbohydrateGrams, fat: m.fatGrams },
      logged: t && logged ? { calories: t.calories, protein: t.protein, carbohydrates: t.carbohydrates, fat: t.fat, foods: logged.map((e) => e.foodName) } : null,
    };
  });
  const plannedSlots = new Set(plannedMeals.map((m) => m.type));
  const planned = meals.reduce((a, m) => ({ calories: a.calories + m.planned.calories, protein: a.protein + m.planned.protein, carbohydrates: a.carbohydrates + m.planned.carbohydrates, fat: a.fat + m.planned.fat }), { calories: 0, protein: 0, carbohydrates: 0, fat: 0 });
  const all = sumEntries(entries);
  const actual = { calories: all.calories, protein: all.protein, carbohydrates: all.carbohydrates, fat: all.fat };
  const loggedCount = meals.filter((m) => m.logged).length;
  return {
    meals,
    plannedCount: meals.length,
    loggedCount,
    loggingPercent: meals.length ? Math.round((loggedCount / meals.length) * 100) : 0,
    unplannedSlots: Array.from(bySlot.keys()).filter((s) => !plannedSlots.has(s)),
    planned: { calories: Math.round(planned.calories), protein: roundTo(planned.protein, 1), carbohydrates: roundTo(planned.carbohydrates, 1), fat: roundTo(planned.fat, 1) },
    actual,
    difference: { calories: Math.round(actual.calories - planned.calories), protein: roundTo(actual.protein - planned.protein, 1), carbohydrates: roundTo(actual.carbohydrates - planned.carbohydrates, 1), fat: roundTo(actual.fat - planned.fat, 1) },
  };
}

/* ------------------------------------------------------------------ */
/* Weekly aggregation                                                  */
/* ------------------------------------------------------------------ */

export interface DayPoint {
  date: string;
  /** Null when nothing was logged that day — charts leave a gap. */
  calories: number | null;
  protein: number | null;
  carbohydrates: number | null;
  fat: number | null;
  waterMl: number | null;
  mealsLogged: number;
  entries: number;
}

export interface WeeklyAverages {
  daysWithFood: number;
  daysWithWater: number;
  calories: number | null;
  protein: number | null;
  carbohydrates: number | null;
  fat: number | null;
  fiber: null;
  waterMl: number | null;
  mealsLogged: number;
  entries: number;
}

export function buildDayPoints(dates: string[], entries: FoodLogEntry[], water: WaterEntry[]): DayPoint[] {
  const food = new Map<string, FoodLogEntry[]>();
  for (const e of entries) food.set(e.logDate, [...(food.get(e.logDate) ?? []), e]);
  const drink = new Map<string, number>();
  for (const w of water) drink.set(w.logDate, (drink.get(w.logDate) ?? 0) + w.amountMl);
  return dates.map((date) => {
    const list = food.get(date) ?? [];
    const t = list.length ? sumEntries(list) : null;
    return {
      date,
      calories: t ? t.calories : null,
      protein: t ? t.protein : null,
      carbohydrates: t ? t.carbohydrates : null,
      fat: t ? t.fat : null,
      waterMl: drink.has(date) ? drink.get(date)! : null,
      mealsLogged: new Set(list.map((e) => e.mealType)).size,
      entries: list.length,
    };
  });
}

/** Averages over days that actually have data (never over empty days). */
export function averageDayPoints(points: DayPoint[]): WeeklyAverages {
  const withFood = points.filter((p) => p.calories !== null);
  const withWater = points.filter((p) => p.waterMl !== null);
  const avg = (vals: (number | null)[]) => {
    const nums = vals.filter((v): v is number => v !== null);
    return nums.length ? roundTo(nums.reduce((s, v) => s + v, 0) / nums.length, 1) : null;
  };
  return {
    daysWithFood: withFood.length,
    daysWithWater: withWater.length,
    calories: withFood.length ? Math.round(avg(withFood.map((p) => p.calories)) ?? 0) : null,
    protein: avg(withFood.map((p) => p.protein)),
    carbohydrates: avg(withFood.map((p) => p.carbohydrates)),
    fat: avg(withFood.map((p) => p.fat)),
    fiber: null,
    waterMl: withWater.length ? Math.round(avg(withWater.map((p) => p.waterMl)) ?? 0) : null,
    mealsLogged: points.reduce((s, p) => s + p.mealsLogged, 0),
    entries: points.reduce((s, p) => s + p.entries, 0),
  };
}

/* ------------------------------------------------------------------ */
/* Comparison                                                          */
/* ------------------------------------------------------------------ */

export interface ComparisonRow {
  key: string;
  label: string;
  unit: string;
  current: number | null;
  previous: number | null;
  /** current − previous; null if either side has no data. */
  change: number | null;
  changePercent: number | null;
}

export function compareMetrics(current: Record<string, number | null>, previous: Record<string, number | null>, rows: { key: string; label: string; unit: string }[]): ComparisonRow[] {
  return rows.map(({ key, label, unit }) => {
    const c = current[key] ?? null;
    const p = previous[key] ?? null;
    const change = c !== null && p !== null ? roundTo(c - p, 1) : null;
    const changePercent = change !== null && p ? Math.round((change / p) * 100) : null;
    return { key, label, unit, current: c, previous: p, change, changePercent };
  });
}

export const COMPARISON_ROWS = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "protein", label: "Protein", unit: "g" },
  { key: "carbohydrates", label: "Carbohydrates", unit: "g" },
  { key: "fat", label: "Fat", unit: "g" },
  { key: "waterMl", label: "Water", unit: "ml" },
  { key: "mealsLogged", label: "Meals logged", unit: "" },
];
