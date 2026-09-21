/**
 * Meal replacement — swap one slot of an existing plan for a different,
 * safe alternative.
 *
 * Reuses the generator's own portion and meal builders (one implementation
 * of those rules) and, crucially, re-runs the INDEPENDENT safety validator
 * on the resulting plan. If the swapped plan would fail any restriction
 * check, the replacement is rejected and the original plan is returned
 * untouched — never a "done" message for a change that did not happen.
 *
 * Daily totals are recomputed from the actual meals after the swap.
 */
import type {
  DietPlan,
  FoodItemRecord,
  MealId,
  UserProfile,
} from "@/types/profile";
import { FOOD_DATABASE, FOOD_BY_ID } from "@/data/foods/foodDatabase";
import { filterFoods, foodsForCategory } from "@/services/diet/filters";
import { SLOT_CATEGORY, type PlannerSlot } from "@/services/diet/config";
import {
  buildPlannedItem,
  chooseServings,
  mealFromItems,
} from "@/services/diet/dietGenerator";
import { validateGeneratedDietPlan } from "@/services/diet/planValidator";
import { roundTo } from "@/lib/numbers";

export type ReplaceResult =
  | { success: true; plan: DietPlan; replacedWith: FoodItemRecord; previousName: string }
  | { success: false; message: string };

/**
 * Lists the alternatives that are SAFE for a given slot: they pass every
 * restriction filter and are not the food already in that slot.
 */
export function listSafeAlternatives(
  plan: DietPlan,
  profile: UserProfile,
  slot: MealId,
  limit = 6,
): FoodItemRecord[] {
  if (slot === "otherSnacks") return [];
  const category = SLOT_CATEGORY[slot as PlannerSlot];
  const { allowed } = filterFoods(FOOD_DATABASE, profile);
  const current = plan.meals.find((m) => m.type === slot);
  const currentIds = new Set(current?.items.map((i) => i.foodId) ?? []);

  return foodsForCategory(allowed, category)
    .filter((food) => !currentIds.has(food.id))
    .slice(0, limit);
}

/** Recompute daily totals FROM the meals — never copied from targets. */
function totalsFrom(meals: DietPlan["meals"]): DietPlan["dailyTotals"] {
  return {
    calories: Math.round(meals.reduce((s, m) => s + m.calories, 0)),
    protein: roundTo(meals.reduce((s, m) => s + m.proteinGrams, 0), 1),
    carbohydrates: roundTo(meals.reduce((s, m) => s + m.carbohydrateGrams, 0), 1),
    fat: roundTo(meals.reduce((s, m) => s + m.fatGrams, 0), 1),
  };
}

export function replaceMealInPlan(
  plan: DietPlan,
  profile: UserProfile,
  slot: MealId,
  replacementFoodId: string,
): ReplaceResult {
  if (slot === "otherSnacks") {
    return { success: false, message: "That slot cannot be replaced." };
  }

  const existing = plan.meals.find((m) => m.type === slot);
  if (!existing) {
    return { success: false, message: `Your plan has no ${slot} to replace.` };
  }

  const food = FOOD_BY_ID.get(replacementFoodId);
  if (!food) {
    return { success: false, message: "That food is not in the database." };
  }

  // The replacement must itself pass the restriction filters.
  const { allowed } = filterFoods([food], profile);
  if (allowed.length === 0) {
    return {
      success: false,
      message: `${food.name} conflicts with your dietary restrictions, so it was not used.`,
    };
  }

  // Aim the new portion at the same calorie budget the slot already had.
  const slotBudget = plan.summary.targetCalories * (existing.targetShare || 0.3);
  const servings = chooseServings(food, slotBudget);
  const item = buildPlannedItem(food, servings);
  const newMeal = mealFromItems(
    slot as PlannerSlot,
    [item],
    existing.time,
    existing.targetShare,
    "Replaced at your request.",
  );

  const meals = plan.meals.map((m) => (m.type === slot ? newMeal : m));
  const candidate: DietPlan = {
    ...plan,
    meals,
    dailyTotals: totalsFrom(meals),
    generatedAt: new Date().toISOString(),
  };

  // Independent safety check on the whole swapped plan.
  const validation = validateGeneratedDietPlan(candidate, profile);
  if (!validation.isValid) {
    return {
      success: false,
      message: `The replacement failed the safety check (${validation.errors[0] ?? "unknown"}). Your plan was not changed.`,
    };
  }

  candidate.validation = {
    ...plan.validation,
    isValid: true,
    errors: [],
    warnings: validation.warnings,
    checks: validation.checks,
  };

  return {
    success: true,
    plan: candidate,
    replacedWith: food,
    previousName: existing.name,
  };
}
