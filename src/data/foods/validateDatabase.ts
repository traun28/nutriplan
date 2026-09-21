/**
 * Development utility: verifies the integrity of the food dataset.
 *
 * Not shown in the normal UI — it exists so dataset mistakes are caught
 * while the database grows (Part 7 requirement 90).
 */
import type { FoodItemRecord } from "@/types/profile";
import { FOOD_DATABASE } from "@/data/foods/foodDatabase";

export interface DatabaseIssue {
  foodId: string;
  problem: string;
}

/** Items that may legitimately contain zero calories (e.g. water). */
const ZERO_CALORIE_ALLOWED = new Set<string>([]);

export function validateFoodDatabase(
  database: FoodItemRecord[] = FOOD_DATABASE,
): DatabaseIssue[] {
  const issues: DatabaseIssue[] = [];
  const seenIds = new Set<string>();

  for (const food of database) {
    const id = food.id || "(missing id)";

    if (!food.id) issues.push({ foodId: id, problem: "Missing id." });
    if (seenIds.has(food.id)) {
      issues.push({ foodId: id, problem: "Duplicate id." });
    }
    seenIds.add(food.id);

    if (!food.name?.trim()) issues.push({ foodId: id, problem: "Missing name." });
    if (!food.category) issues.push({ foodId: id, problem: "Missing category." });

    if (!Array.isArray(food.dietaryTypes) || food.dietaryTypes.length === 0) {
      issues.push({ foodId: id, problem: "Missing dietaryTypes." });
    }
    if (!Array.isArray(food.allergens)) {
      issues.push({ foodId: id, problem: "Missing allergens array." });
    }
    if (!Array.isArray(food.ingredients) || food.ingredients.length === 0) {
      issues.push({ foodId: id, problem: "Missing ingredients." });
    }
    if (!food.servingSize || !food.servingSize.unit) {
      issues.push({ foodId: id, problem: "Missing servingSize." });
    } else if (food.servingSize.quantity <= 0) {
      issues.push({ foodId: id, problem: "servingSize.quantity must be > 0." });
    }

    const numbers: Array<[string, number]> = [
      ["calories", food.calories],
      ["proteinGrams", food.proteinGrams],
      ["carbohydrateGrams", food.carbohydrateGrams],
      ["fatGrams", food.fatGrams],
    ];
    for (const [field, value] of numbers) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        issues.push({ foodId: id, problem: `${field} is not a finite number.` });
      } else if (value < 0) {
        issues.push({ foodId: id, problem: `${field} must not be negative.` });
      }
    }

    if (food.calories === 0 && !ZERO_CALORIE_ALLOWED.has(food.id)) {
      issues.push({ foodId: id, problem: "Zero calories is unexpected for this item." });
    }

    if (food.minServings <= 0 || food.maxServings < food.minServings) {
      issues.push({ foodId: id, problem: "Invalid serving bounds." });
    }

    // Ingredients must be normalised so conflict matching is reliable.
    for (const ingredient of food.ingredients ?? []) {
      if (ingredient !== ingredient.trim().toLowerCase()) {
        issues.push({
          foodId: id,
          problem: `Ingredient "${ingredient}" is not normalised (lowercase, trimmed).`,
        });
      }
    }
  }

  return issues;
}
