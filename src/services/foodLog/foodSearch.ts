/**
 * Phase 2 — client-side search over the existing food dataset.
 * The dataset is small (bundled, ~50 items), so searching in memory is
 * faster and simpler than a round-trip. Ranks prefix matches first.
 */
import type { FoodCategory, FoodItemRecord } from "@/types/profile";
import { FOOD_DATABASE } from "@/data/foods/foodDatabase";

export const FOOD_CATEGORY_OPTIONS: { id: FoodCategory | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "breakfast", label: "Breakfast" },
  { id: "morning_snack", label: "Morning snack" },
  { id: "lunch", label: "Lunch" },
  { id: "evening_snack", label: "Evening snack" },
  { id: "dinner", label: "Dinner" },
  { id: "beverage", label: "Beverages" },
];

export function foodCategoryLabel(category: FoodCategory): string {
  return FOOD_CATEGORY_OPTIONS.find((option) => option.id === category)?.label ?? category;
}

function fitsCategory(food: FoodItemRecord, category: FoodCategory | "all"): boolean {
  if (category === "all") return true;
  return food.category === category || (food.alsoSuitableFor ?? []).includes(category);
}

export function searchFoods(
  query: string,
  options: { category?: FoodCategory | "all"; limit?: number; onlyIds?: Set<string> } = {},
): FoodItemRecord[] {
  const { category = "all", limit = 40, onlyIds } = options;
  const q = query.trim().toLowerCase();
  const scored: { food: FoodItemRecord; score: number }[] = [];

  for (const food of FOOD_DATABASE) {
    if (onlyIds && !onlyIds.has(food.id)) continue;
    if (!fitsCategory(food, category)) continue;
    if (!q) {
      scored.push({ food, score: 0 });
      continue;
    }
    const name = food.name.toLowerCase();
    let score = -1;
    if (name.startsWith(q)) score = 3;
    else if (name.split(/\s+/).some((word) => word.startsWith(q))) score = 2;
    else if (name.includes(q)) score = 1;
    else if (food.ingredients.some((ingredient) => ingredient.includes(q))) score = 0.5;
    else if (food.tags.some((tag) => tag.replace(/_/g, " ").includes(q))) score = 0.25;
    if (score >= 0) scored.push({ food, score });
  }

  scored.sort((a, b) => b.score - a.score || a.food.name.localeCompare(b.food.name));
  return scored.slice(0, limit).map((entry) => entry.food);
}
