/**
 * Phase 4 — GET /api/recipes?q=&mealType=&cuisine=&dietaryType=&maxPrep=&maxCalories=&minProtein=&difficulty=&safe=1&favorites=1
 * Read-only shared recipe data (the food database + authored details).
 * When signed in, `safe=1` hides recipes conflicting with the profile.
 */
import type { DietaryType, FoodCategory, MealComplexity } from "@/types/profile";
import { currentUser } from "@/services/server/guard";
import { getProfile } from "@/services/server/repository";
import { listRecipeFavoriteIds } from "@/services/server/kitchenRepository";
import { searchRecipes, toSummary } from "@/services/recipes/recipeService";
import { unitLabel } from "@/data/options";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function num(value: string | null): number | null {
  if (value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const p = url.searchParams;
  const user = await currentUser();

  let profile = null;
  let favoriteIds: string[] = [];
  if (user) {
    profile = await getProfile(user.id);
    if (p.get("favorites") === "1") {
      try {
        favoriteIds = await listRecipeFavoriteIds(user.id);
      } catch {
        return Response.json({ error: "Your saved recipes could not be loaded right now." }, { status: 503 });
      }
    }
  } else if (p.get("favorites") === "1") {
    return Response.json({ error: "You need to sign in to do that." }, { status: 401 });
  }

  const { recipes, hidden } = searchRecipes({
    q: p.get("q") ?? "",
    mealType: (p.get("mealType") as FoodCategory | "all" | null) ?? "all",
    cuisine: p.get("cuisine") ?? "all",
    dietaryType: (p.get("dietaryType") as DietaryType | "all" | null) ?? "all",
    maxPrepMinutes: num(p.get("maxPrep")),
    maxCalories: num(p.get("maxCalories")),
    minProtein: num(p.get("minProtein")),
    difficulty: (p.get("difficulty") as MealComplexity | "all" | null) ?? "all",
    onlyIds: p.get("favorites") === "1" ? new Set(favoriteIds) : null,
    safeFor: p.get("safe") === "1" ? profile : null,
  });

  return Response.json({
    recipes: recipes.map((r) => toSummary(r, `${r.servingSize.quantity} ${unitLabel(r.servingSize.unit)}`)),
    hidden,
    total: recipes.length,
  });
}
