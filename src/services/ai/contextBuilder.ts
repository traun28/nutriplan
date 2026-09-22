/**
 * Phase 6 — centralised, lazy AI context builder.
 *
 * Each group is loaded at most once per request and only when an intent
 * asks for it, so a pantry question never reads food logs and a general
 * question reads nothing at all. Every group is built from the existing
 * repositories/engines — nothing here recalculates nutrition.
 *
 * `summarise*` functions turn a group into the compact, minimum-necessary
 * text that may be shared with an external AI provider. They deliberately
 * omit identifiers, e-mail, names, timestamps and anything not needed to
 * answer the question.
 */
import type { UserProfile } from "@/types/profile";
import { getProfile } from "@/services/server/repository";
import { listFoodLogsForDate, listWaterForDate, getSettings } from "@/services/server/foodLogRepository";
import { getCurrentMealPlan } from "@/services/server/mealPlanRepository";
import { listPantry, listRecipeFavoriteIds, getGroceryList, type PantryItemRecord } from "@/services/server/kitchenRepository";
import { listProgressInRange } from "@/services/server/progressRepository";
import { buildDailyAnalytics, buildWeeklyAnalytics, loadTargets } from "@/services/server/analyticsService";
import { dayIndexForDate, type WeeklyPlanRecord } from "@/services/diet/weeklyPlanner";
import { remainingOf, shiftDateKey, sumEntries } from "@/services/foodLog/calculations";
import { DEFAULT_WATER_TARGET_ML } from "@/services/foodLog/water";
import { allergenLabel, intoleranceLabel, labelFor, DIETARY_TYPES } from "@/data/options";
import type { DailyTargets, DailyTotals, FoodLogEntry } from "@/services/foodLog/types";

export interface RequestClock {
  today: string;
  hour: number;
}

export interface ProfileContext {
  profile: UserProfile | null;
  dietaryType: string;
  dietaryLabel: string | null;
  allergies: string[];
  intolerances: string[];
  foodsToAvoid: string[];
  preferredFoods: string[];
  goal: string | null;
  prepTime: string;
}

export interface NutritionContext {
  targets: DailyTargets;
  hasTargets: boolean;
  totals: DailyTotals;
  entries: FoodLogEntry[];
  remaining: { calories: number | null; protein: number | null; carbohydrates: number | null; fat: number | null };
  over: { calories: number; protein: number };
  waterMl: number;
  waterTargetMl: number;
}

export interface MealPlanContext {
  plan: WeeklyPlanRecord | null;
  todayIndex: number | null;
  tomorrowIndex: number | null;
}

export interface PantryContext {
  items: PantryItemRecord[];
  names: string[];
}

export type DailyAnalytics = Awaited<ReturnType<typeof buildDailyAnalytics>>;
export type WeeklyAnalytics = Awaited<ReturnType<typeof buildWeeklyAnalytics>>;

export class AiContext {
  private cache = new Map<string, Promise<unknown>>();
  constructor(readonly userId: number, readonly clock: RequestClock) {}

  private memo<T>(key: string, load: () => Promise<T>): Promise<T> {
    if (!this.cache.has(key)) this.cache.set(key, load());
    return this.cache.get(key) as Promise<T>;
  }

  profile(): Promise<ProfileContext> {
    return this.memo("profile", async () => {
      const profile = await getProfile(this.userId);
      const { processed } = await this.targets();
      const dietaryType = profile?.dietaryPreferences.dietaryType ?? "";
      return {
        profile,
        dietaryType,
        dietaryLabel: dietaryType ? labelFor(DIETARY_TYPES, dietaryType) : null,
        allergies: (profile?.allergies ?? []).filter((a) => a !== "none").map(allergenLabel),
        intolerances: (profile?.intolerances ?? []).map(intoleranceLabel),
        foodsToAvoid: profile?.foodsToAvoid ?? [],
        preferredFoods: profile?.preferredFoods ?? [],
        goal: processed?.goal?.label ?? null,
        prepTime: profile?.practicalConstraints.mealPreparationTime ?? "",
      };
    });
  }

  private targets() {
    return this.memo("targets", async () => {
      const t = await loadTargets(this.userId);
      const { getProcessed } = await import("@/services/server/repository");
      const processed = await getProcessed(this.userId);
      return { ...t, processed };
    });
  }

  nutrition(date = this.clock.today): Promise<NutritionContext> {
    return this.memo(`nutrition:${date}`, async () => {
      const [{ targets, hasTargets }, entries, water, settings] = await Promise.all([
        this.targets(),
        listFoodLogsForDate(this.userId, date),
        listWaterForDate(this.userId, date),
        getSettings(this.userId),
      ]);
      const totals = sumEntries(entries);
      const rem = (t: number | null, c: number) => remainingOf(t, c);
      return {
        targets,
        hasTargets,
        totals,
        entries,
        remaining: {
          calories: rem(targets.calories, totals.calories).remaining,
          protein: rem(targets.protein, totals.protein).remaining,
          carbohydrates: rem(targets.carbohydrates, totals.carbohydrates).remaining,
          fat: rem(targets.fat, totals.fat).remaining,
        },
        over: { calories: rem(targets.calories, totals.calories).over ?? 0, protein: rem(targets.protein, totals.protein).over ?? 0 },
        waterMl: water.reduce((s, w) => s + w.amountMl, 0),
        waterTargetMl: settings.waterTargetMl ?? DEFAULT_WATER_TARGET_ML,
      };
    });
  }

  mealPlan(): Promise<MealPlanContext> {
    return this.memo("mealPlan", async () => {
      const plan = await getCurrentMealPlan(this.userId);
      return {
        plan,
        todayIndex: plan ? dayIndexForDate(plan.startDate, this.clock.today) : null,
        tomorrowIndex: plan ? dayIndexForDate(plan.startDate, shiftDateKey(this.clock.today, 1)) : null,
      };
    });
  }

  pantry(): Promise<PantryContext> {
    return this.memo("pantry", async () => {
      const items = (await listPantry(this.userId)).filter((i) => i.quantity !== 0);
      return { items, names: items.map((i) => i.name) };
    });
  }

  favoriteRecipeIds(): Promise<string[]> {
    return this.memo("favorites", () => listRecipeFavoriteIds(this.userId));
  }

  grocery() {
    return this.memo("grocery", () => getGroceryList(this.userId));
  }

  dailyAnalytics(date = this.clock.today): Promise<DailyAnalytics> {
    return this.memo(`daily:${date}`, () => buildDailyAnalytics(this.userId, date, this.clock.today, this.clock.hour));
  }

  weeklyAnalytics(date = this.clock.today): Promise<WeeklyAnalytics> {
    return this.memo(`weekly:${date}`, () => buildWeeklyAnalytics(this.userId, date));
  }

  progress() {
    return this.memo("progress", () => listProgressInRange(this.userId, shiftDateKey(this.clock.today, -90), this.clock.today));
  }
}

/* ------------------------------------------------------------------ */
/* Minimum-necessary summaries for the external provider               */
/* ------------------------------------------------------------------ */

export function summariseProfile(p: ProfileContext): string {
  const parts: string[] = [];
  if (p.dietaryLabel) parts.push(`Diet: ${p.dietaryLabel}`);
  if (p.allergies.length) parts.push(`Allergies: ${p.allergies.join(", ")}`);
  if (p.intolerances.length) parts.push(`Intolerances: ${p.intolerances.join(", ")}`);
  if (p.foodsToAvoid.length) parts.push(`Avoids: ${p.foodsToAvoid.join(", ")}`);
  if (p.goal) parts.push(`Goal: ${p.goal}`);
  return parts.length ? parts.join(". ") + "." : "No dietary restrictions recorded.";
}

export function summariseNutrition(n: NutritionContext): string {
  const t = n.targets;
  const fmt = (v: number | null) => (v === null ? "not set" : Math.round(v).toString());
  const lines = [
    `Logged today: ${Math.round(n.totals.calories)} kcal, ${Math.round(n.totals.protein)} g protein, ${Math.round(n.totals.carbohydrates)} g carbs, ${Math.round(n.totals.fat)} g fat across ${n.entries.length} entries.`,
    `Targets: ${fmt(t.calories)} kcal, ${fmt(t.protein)} g protein, ${fmt(t.carbohydrates)} g carbs, ${fmt(t.fat)} g fat.`,
  ];
  if (n.hasTargets) {
    lines.push(`Remaining: ${fmt(n.remaining.calories)} kcal, ${fmt(n.remaining.protein)} g protein.`);
  }
  lines.push(`Water: ${n.waterMl} ml of ${n.waterTargetMl} ml.`);
  if (n.entries.length) {
    lines.push(`Meals: ${n.entries.map((e) => `${e.mealType}: ${e.foodName} (${Math.round(e.calories)} kcal, ${Math.round(e.proteinGrams)} g protein)`).join("; ")}.`);
  }
  return lines.join(" ");
}

export function summarisePantry(p: PantryContext): string {
  return p.names.length ? `Pantry items: ${p.names.join(", ")}.` : "Pantry is empty.";
}
