/**
 * Phase 4 — recipe view over the food database.
 *
 * A "recipe" is a food record (single nutrition source) plus, when
 * authored, its RecipeDetail (quantities, steps, cook time). This module
 * builds that combined read-only view, searches/filters it, and checks a
 * recipe against a user's restrictions using the Part 7 filters.
 */
import type { DietaryType, FoodCategory, FoodItemRecord, MealComplexity, UserProfile } from "@/types/profile";
import { FOOD_BY_ID, FOOD_DATABASE } from "@/data/foods/foodDatabase";
import { RECIPE_DETAILS, type RecipeIngredient } from "@/data/recipes/recipeDetails";
import { filterFoods } from "@/services/diet/filters";

export interface Recipe {
  id: string;
  name: string;
  category: FoodCategory;
  mealTypes: FoodCategory[];
  description: string | null;
  servingSize: FoodItemRecord["servingSize"];
  nutrition: {
    calories: number;
    proteinGrams: number;
    carbohydrateGrams: number;
    fatGrams: number;
    /** Never present in the food database — surfaced as null, not zero. */
    fiberGrams: null;
  };
  prepMinutes: number;
  /** Null when no authored recipe detail exists. */
  cookMinutes: number | null;
  totalMinutes: number | null;
  difficulty: MealComplexity;
  dietaryTypes: DietaryType[];
  allergens: string[];
  intoleranceFlags: string[];
  tags: string[];
  cuisines: string[];
  /** Normalised ingredient names (always available). */
  ingredientNames: string[];
  /** Quantified ingredients per one serving; null when not authored. */
  ingredients: RecipeIngredient[] | null;
  steps: string[] | null;
  hasDetail: boolean;
  minServings: number;
  maxServings: number;
}

export interface RecipeSummary {
  id: string;
  name: string;
  category: FoodCategory;
  description: string | null;
  calories: number;
  proteinGrams: number;
  carbohydrateGrams: number;
  fatGrams: number;
  prepMinutes: number;
  totalMinutes: number | null;
  difficulty: MealComplexity;
  dietaryTypes: DietaryType[];
  allergens: string[];
  cuisines: string[];
  tags: string[];
  ingredientNames: string[];
  hasDetail: boolean;
  servingLabel: string;
}

export function toRecipe(food: FoodItemRecord): Recipe {
  const detail = RECIPE_DETAILS[food.id] ?? null;
  const cook = detail ? detail.cookMinutes : null;
  return {
    id: food.id,
    name: food.name,
    category: food.category,
    mealTypes: [food.category, ...(food.alsoSuitableFor ?? [])],
    description: detail?.description ?? null,
    servingSize: food.servingSize,
    nutrition: {
      calories: food.calories,
      proteinGrams: food.proteinGrams,
      carbohydrateGrams: food.carbohydrateGrams,
      fatGrams: food.fatGrams,
      fiberGrams: null,
    },
    prepMinutes: food.preparationTimeMinutes,
    cookMinutes: cook,
    totalMinutes: cook === null ? null : food.preparationTimeMinutes + cook,
    difficulty: food.complexity,
    dietaryTypes: food.dietaryTypes,
    allergens: food.allergens,
    intoleranceFlags: food.intoleranceFlags,
    tags: food.tags,
    cuisines: food.cuisines,
    ingredientNames: food.ingredients,
    ingredients: detail?.ingredients ?? null,
    steps: detail?.steps ?? null,
    hasDetail: detail !== null,
    minServings: food.minServings,
    maxServings: food.maxServings,
  };
}

export function toSummary(recipe: Recipe, servingLabel: string): RecipeSummary {
  return {
    id: recipe.id,
    name: recipe.name,
    category: recipe.category,
    description: recipe.description,
    calories: recipe.nutrition.calories,
    proteinGrams: recipe.nutrition.proteinGrams,
    carbohydrateGrams: recipe.nutrition.carbohydrateGrams,
    fatGrams: recipe.nutrition.fatGrams,
    prepMinutes: recipe.prepMinutes,
    totalMinutes: recipe.totalMinutes,
    difficulty: recipe.difficulty,
    dietaryTypes: recipe.dietaryTypes,
    allergens: recipe.allergens,
    cuisines: recipe.cuisines,
    tags: recipe.tags,
    ingredientNames: recipe.ingredientNames,
    hasDetail: recipe.hasDetail,
    servingLabel,
  };
}

export function getRecipe(id: string): Recipe | null {
  const food = FOOD_BY_ID.get(id);
  return food ? toRecipe(food) : null;
}

export function listRecipes(): Recipe[] {
  return FOOD_DATABASE.map(toRecipe);
}

/* ------------------------------------------------------------------ */
/* Search & filters                                                    */
/* ------------------------------------------------------------------ */

export interface RecipeQuery {
  q?: string;
  mealType?: FoodCategory | "all";
  cuisine?: string | "all";
  dietaryType?: DietaryType | "all";
  maxPrepMinutes?: number | null;
  maxCalories?: number | null;
  minProtein?: number | null;
  difficulty?: MealComplexity | "all";
  onlyIds?: Set<string> | null;
  /** When true, also hide recipes conflicting with the profile's restrictions. */
  safeFor?: UserProfile | null;
}

export function searchRecipes(query: RecipeQuery): { recipes: Recipe[]; hidden: number } {
  const q = (query.q ?? "").trim().toLowerCase();
  let pool = FOOD_DATABASE;
  let hidden = 0;
  if (query.safeFor) {
    const { allowed, rejections } = filterFoods(pool, query.safeFor);
    hidden = rejections.length;
    pool = allowed;
  }

  const scored: { food: FoodItemRecord; score: number }[] = [];
  for (const food of pool) {
    if (query.onlyIds && !query.onlyIds.has(food.id)) continue;
    const mealTypes = [food.category, ...(food.alsoSuitableFor ?? [])];
    if (query.mealType && query.mealType !== "all" && !mealTypes.includes(query.mealType)) continue;
    if (query.cuisine && query.cuisine !== "all" && !food.cuisines.includes(query.cuisine)) continue;
    if (query.dietaryType && query.dietaryType !== "all" && !food.dietaryTypes.includes(query.dietaryType)) continue;
    if (query.maxPrepMinutes != null && food.preparationTimeMinutes > query.maxPrepMinutes) continue;
    if (query.maxCalories != null && food.calories > query.maxCalories) continue;
    if (query.minProtein != null && food.proteinGrams < query.minProtein) continue;
    if (query.difficulty && query.difficulty !== "all" && food.complexity !== query.difficulty) continue;

    let score = 1;
    if (q) {
      const name = food.name.toLowerCase();
      const desc = (RECIPE_DETAILS[food.id]?.description ?? "").toLowerCase();
      if (name === q) score = 100;
      else if (name.startsWith(q)) score = 80;
      else if (name.includes(q)) score = 60;
      else if (food.ingredients.some((i) => i.includes(q))) score = 40;
      else if (food.cuisines.some((c) => c.replace(/_/g, " ").includes(q)) || food.category.replace(/_/g, " ").includes(q)) score = 30;
      else if (food.tags.some((t) => t.replace(/_/g, " ").includes(q))) score = 20;
      else if (desc.includes(q)) score = 10;
      else continue;
    }
    scored.push({ food, score });
  }
  scored.sort((a, b) => b.score - a.score || a.food.name.localeCompare(b.food.name));
  return { recipes: scored.map((s) => toRecipe(s.food)), hidden };
}

/** Restriction check reused before adding to a plan or recommending. */
export function recipeConflicts(food: FoodItemRecord, profile: UserProfile): string | null {
  const { rejections } = filterFoods([food], profile);
  return rejections[0]?.detail ?? null;
}

/* ------------------------------------------------------------------ */
/* Pantry-based suggestions                                            */
/* ------------------------------------------------------------------ */

export interface PantryMatch {
  recipe: Recipe;
  matched: string[];
  missing: string[];
  /** matched / total ingredient names. */
  coverage: number;
}

/**
 * Recipes that use what the user already has. Only recipes passing the
 * profile's restriction filters are considered; nothing is invented.
 */
export function recipesForPantry(
  pantryNames: string[],
  profile: UserProfile | null,
  limit = 8,
): PantryMatch[] {
  const have = new Set(pantryNames.map((n) => n.trim().toLowerCase()));
  if (have.size === 0) return [];
  const pool = profile ? filterFoods(FOOD_DATABASE, profile).allowed : FOOD_DATABASE;
  const matches: PantryMatch[] = [];
  for (const food of pool) {
    const matched = food.ingredients.filter((i) => have.has(i));
    if (matched.length === 0) continue;
    const missing = food.ingredients.filter((i) => !have.has(i));
    matches.push({ recipe: toRecipe(food), matched, missing, coverage: matched.length / food.ingredients.length });
  }
  return matches
    .sort((a, b) => b.coverage - a.coverage || b.matched.length - a.matched.length || a.recipe.name.localeCompare(b.recipe.name))
    .slice(0, limit);
}
