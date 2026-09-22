/**
 * Phase 6 — structured tools the assistant can run.
 *
 * Every tool is a thin, read-only wrapper around an existing service:
 * suggestions come from the food database through the Phase 3 restriction
 * filters and scaling helpers, replacements come from the Phase 3
 * `alternativesFor`, pantry matches from Phase 4 `recipesForPantry`, and
 * nutrition from Phase 5 analytics. Tools never write; writes happen only
 * in the /api/assistant/actions route after re-validation.
 */
import type { FoodItemRecord, MealId, UserProfile } from "@/types/profile";
import { FOOD_DATABASE, FOOD_BY_ID } from "@/data/foods/foodDatabase";
import { filterFoods, foodsForCategory } from "@/services/diet/filters";
import { buildPlannedItem, chooseServings } from "@/services/diet/dietGenerator";
import { SLOT_CATEGORY, PREP_TIME_LIMITS, type PlannerSlot } from "@/services/diet/config";
import { alternativesFor, type MealAlternative } from "@/services/diet/weeklyPlanner";
import { recipesForPantry, searchRecipes, toRecipe, type Recipe } from "@/services/recipes/recipeService";
import { searchFoods } from "@/services/foodLog/foodSearch";
import { pantryIngredientsFor } from "@/services/server/mealPlanService";
import type { AiContext, NutritionContext, ProfileContext } from "./contextBuilder";
import type { AssistantAction, FoodCard, RecipeCard } from "./types";

export const PLANNER_SLOTS: PlannerSlot[] = ["breakfast", "morningSnack", "lunch", "eveningSnack", "dinner"];

export function isPlannerSlot(v: string): v is PlannerSlot {
  return (PLANNER_SLOTS as string[]).includes(v);
}

export function slotLabel(slot: MealId): string {
  return { breakfast: "breakfast", morningSnack: "morning snack", lunch: "lunch", eveningSnack: "evening snack", dinner: "dinner", otherSnacks: "snack" }[slot];
}

/** Picks the meal slot most relevant to the current hour. */
export function slotForHour(hour: number): PlannerSlot {
  if (hour < 10) return "breakfast";
  if (hour < 12) return "morningSnack";
  if (hour < 16) return "lunch";
  if (hour < 19) return "eveningSnack";
  return "dinner";
}

/** Safe pool: the Phase 3 filters are the final word on allergies/diet. */
export function safeFoods(profile: UserProfile | null): FoodItemRecord[] {
  return profile ? filterFoods(FOOD_DATABASE, profile).allowed : FOOD_DATABASE;
}

export function isFoodSafeFor(foodId: string, profile: UserProfile | null): { ok: true; food: FoodItemRecord } | { ok: false; reason: string } {
  const food = FOOD_BY_ID.get(foodId);
  if (!food) return { ok: false, reason: "That food is not in the food database." };
  if (!profile) return { ok: true, food };
  const { rejections } = filterFoods([food], profile);
  return rejections[0] ? { ok: false, reason: `${food.name} ${rejections[0].detail}.` } : { ok: true, food };
}

export interface SuggestOptions {
  slot: PlannerSlot;
  limit?: number;
  highProtein?: boolean;
  quick?: boolean;
  query?: string;
  excludeIds?: string[];
  preferIngredients?: string[];
}

/**
 * Meal suggestions for a slot, scaled to what is left of today's targets
 * (or the slot's typical share when nothing is logged / no targets).
 */
export function suggestMeals(
  profile: ProfileContext,
  nutrition: NutritionContext,
  today: string,
  opts: SuggestOptions,
): FoodCard[] {
  const limit = opts.limit ?? 3;
  const pool = safeFoods(profile.profile);
  let candidates = foodsForCategory(pool, SLOT_CATEGORY[opts.slot]).filter((f) => !(opts.excludeIds ?? []).includes(f.id));
  if (opts.query) {
    const q = opts.query.toLowerCase();
    const matched = candidates.filter((f) => f.name.toLowerCase().includes(q) || f.ingredients.some((i) => i.includes(q)) || f.tags.some((t) => t.includes(q)) || f.cuisines.some((c) => c.includes(q)));
    if (matched.length) candidates = matched;
  }
  const prepLimit = opts.quick ? 20 : (PREP_TIME_LIMITS[profile.prepTime] ?? null);
  if (prepLimit !== null) {
    const quick = candidates.filter((f) => f.preparationTimeMinutes <= prepLimit);
    if (quick.length >= Math.min(3, candidates.length)) candidates = quick;
  }

  const share = { breakfast: 0.25, morningSnack: 0.1, lunch: 0.3, eveningSnack: 0.1, dinner: 0.25 }[opts.slot];
  const targetCalories = nutrition.targets.calories;
  const remainingCal = nutrition.remaining.calories;
  const remainingProt = nutrition.remaining.protein;
  // Budget for this meal: what's left (if meaningful) capped by the slot's usual share.
  const slotBudget = targetCalories ? targetCalories * share : 500;
  const budget = remainingCal !== null && remainingCal > 0 ? Math.min(remainingCal, slotBudget * 1.4) : slotBudget;
  const wantProtein = remainingProt !== null ? remainingProt : null;

  const pantry = new Set((opts.preferIngredients ?? []).map((s) => s.toLowerCase()));

  const scored = candidates.map((food) => {
    const servings = chooseServings(food, budget);
    const item = buildPlannedItem(food, servings);
    let score = 0;
    const calGap = Math.abs(item.calories - budget) / Math.max(budget, 1);
    score += Math.max(0, 1 - calGap) * 0.5;
    if (wantProtein !== null && wantProtein > 0) score += Math.min(1, item.proteinGrams / wantProtein) * 0.3;
    if (opts.highProtein) score += (item.proteinGrams / Math.max(item.calories, 1)) * 10;
    if (profile.preferredFoods.some((p) => food.name.toLowerCase().includes(p) || food.ingredients.includes(p))) score += 0.1;
    if (pantry.size && food.ingredients.some((i) => pantry.has(i))) score += 0.15;
    if (opts.quick) score += Math.max(0, 1 - food.preparationTimeMinutes / 30) * 0.2;
    return { food, item, servings, score };
  });
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(({ food, item, servings }) => {
    const reasons: string[] = [];
    if (remainingCal !== null && remainingCal > 0) {
      reasons.push(item.calories <= remainingCal ? `fits within your remaining ${Math.round(remainingCal)} kcal` : `close to your remaining ${Math.round(remainingCal)} kcal`);
    } else if (targetCalories) reasons.push(`sized to about ${Math.round(share * 100)}% of your ${Math.round(targetCalories)} kcal target`);
    if (wantProtein !== null && wantProtein > 0 && item.proteinGrams >= wantProtein * 0.3) reasons.push(`provides ${Math.round(item.proteinGrams)} g of the ${Math.round(wantProtein)} g protein still to go`);
    if (profile.dietaryLabel && profile.dietaryType && food.dietaryTypes.includes(profile.dietaryType as FoodItemRecord["dietaryTypes"][number])) reasons.push(`matches your ${profile.dietaryLabel.toLowerCase()} preference`);
    if (pantry.size) {
      const have = food.ingredients.filter((i) => pantry.has(i));
      if (have.length) reasons.push(`uses ${have.slice(0, 3).join(", ")} from your pantry`);
    }
    const labels: string[] = [];
    if (food.preparationTimeMinutes <= 15) labels.push("Quick");
    if (item.proteinGrams / Math.max(item.calories, 1) >= 0.05) labels.push("Higher protein");
    if (food.tags.includes("budget")) labels.push("Budget-friendly");
    return {
      kind: "food",
      foodId: food.id,
      name: food.name,
      servings,
      portionLabel: item.portionLabel,
      calories: item.calories,
      proteinGrams: item.proteinGrams,
      carbohydrateGrams: item.carbohydrateGrams,
      fatGrams: item.fatGrams,
      prepMinutes: food.preparationTimeMinutes,
      reason: reasons.length ? `Suggested because it ${reasons.join(" and ")}.` : "Suggested from foods that pass your restriction settings.",
      labels,
      actions: [
        { type: "log_food", label: `Log as ${slotLabel(opts.slot)}`, foodId: food.id, foodName: food.name, servings, mealType: opts.slot, logDate: today },
        { type: "navigate", label: "View recipe", href: `/recipes/${food.id}` },
      ],
    };
  });
}

/** Phase 3 alternatives for a slot of the current plan (unchanged engine). */
export async function replacementOptions(ctx: AiContext, slot: PlannerSlot, dayOffset: 0 | 1 = 0): Promise<
  | { ok: false; reason: "no_plan" | "day_not_in_plan" | "slot_missing" | "no_profile" }
  | { ok: true; planId: number; dayIndex: number; current: { name: string; calories: number; proteinGrams: number }; alternatives: MealAlternative[]; cards: FoodCard[] }
> {
  const [{ plan, todayIndex, tomorrowIndex }, profileCtx] = await Promise.all([ctx.mealPlan(), ctx.profile()]);
  if (!plan) return { ok: false, reason: "no_plan" };
  if (!profileCtx.profile) return { ok: false, reason: "no_profile" };
  const dayIndex = dayOffset === 0 ? todayIndex : tomorrowIndex;
  if (dayIndex === null) return { ok: false, reason: "day_not_in_plan" };
  const day = plan.data.days.find((d) => d.dayIndex === dayIndex);
  const current = day?.plan.meals.find((m) => m.type === slot);
  if (!day || !current) return { ok: false, reason: "slot_missing" };
  const preferIngredients = await pantryIngredientsFor(ctx.userId, plan.data.options.preferPantry === true);
  const alternatives = alternativesFor(plan.data, profileCtx.profile, dayIndex, slot, 4, preferIngredients);
  const cards: FoodCard[] = alternatives.map((a) => ({
    kind: "food",
    foodId: a.foodId,
    name: a.name,
    servings: a.servings,
    portionLabel: a.portionLabel,
    calories: a.calories,
    proteinGrams: a.proteinGrams,
    carbohydrateGrams: a.carbohydrateGrams,
    fatGrams: a.fatGrams,
    prepMinutes: a.preparationTimeMinutes,
    reason: a.explanation,
    labels: a.labels,
    actions: [{ type: "replace_meal", label: `Use for ${slotLabel(slot)}`, planId: plan.id, dayIndex, slot, foodId: a.foodId, foodName: a.name }],
  }));
  return { ok: true, planId: plan.id, dayIndex, current: { name: current.name, calories: current.calories, proteinGrams: current.proteinGrams }, alternatives, cards };
}

export function recipeCard(recipe: Recipe, matched: string[] = [], missing: string[] = []): RecipeCard {
  return {
    kind: "recipe",
    recipeId: recipe.id,
    name: recipe.name,
    calories: recipe.nutrition.calories,
    proteinGrams: recipe.nutrition.proteinGrams,
    prepMinutes: recipe.prepMinutes,
    matched,
    missing,
    hasDetail: recipe.hasDetail,
    actions: [{ type: "navigate", label: "Open recipe", href: `/recipes/${recipe.id}` }],
  };
}

/** Recipes the user can make with recorded pantry items only. */
export function pantryRecipes(pantryNames: string[], profile: UserProfile | null, limit = 4): RecipeCard[] {
  return recipesForPantry(pantryNames, profile, limit).map((m) => recipeCard(m.recipe, m.matched, m.missing));
}

export function findRecipes(query: string, profile: UserProfile | null, opts: { slot?: PlannerSlot; quick?: boolean; highProtein?: boolean; limit?: number } = {}): RecipeCard[] {
  const { recipes } = searchRecipes({
    q: query,
    safeFor: profile,
    mealType: opts.slot ? SLOT_CATEGORY[opts.slot] : "all",
    maxPrepMinutes: opts.quick ? 20 : null,
    minProtein: opts.highProtein ? 12 : null,
  });
  return recipes.slice(0, opts.limit ?? 4).map((r) => recipeCard(r));
}

export function lookupFood(query: string): FoodItemRecord | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const exact = FOOD_DATABASE.find((f) => f.name.toLowerCase() === q);
  if (exact) return exact;
  return searchFoods(q, { limit: 1 })[0] ?? null;
}

export function foodCardFor(food: FoodItemRecord, servings: number, mealType: MealId, today: string, reason: string): FoodCard {
  const item = buildPlannedItem(food, servings);
  const actions: AssistantAction[] = [
    { type: "log_food", label: `Log as ${slotLabel(mealType)}`, foodId: food.id, foodName: food.name, servings, mealType, logDate: today },
    { type: "navigate", label: "View recipe", href: `/recipes/${food.id}` },
  ];
  return {
    kind: "food",
    foodId: food.id,
    name: food.name,
    servings,
    portionLabel: item.portionLabel,
    calories: item.calories,
    proteinGrams: item.proteinGrams,
    carbohydrateGrams: item.carbohydrateGrams,
    fatGrams: item.fatGrams,
    prepMinutes: food.preparationTimeMinutes,
    reason,
    labels: [],
    actions,
  };
}

export { toRecipe };
