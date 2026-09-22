/**
 * Phase 4 — the signed-in user's grocery list.
 *   GET  /api/grocery            → list with items
 *   POST /api/grocery            → add custom item(s) { items: [{name, category?, quantity?, unit?}] } or a recipe's ingredients { recipeId, servings? }
 */
import { currentUser, errorResponse, readJson, unauthorized } from "@/services/server/guard";
import { addGroceryItems, getGroceryList } from "@/services/server/kitchenRepository";
import { cleanName, parseCategory, parseQuantity } from "@/services/server/kitchenHttp";
import { categoryForIngredient } from "@/data/recipes/ingredientCatalog";
import { getRecipe } from "@/services/recipes/recipeService";
import { presentQuantity, toBase, type GroceryUnit } from "@/services/grocery/units";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  try {
    return Response.json({ list: await getGroceryList(user.id) });
  } catch (error) {
    return errorResponse(error);
  }
}

interface Body {
  items?: { name?: unknown; category?: unknown; quantity?: unknown; unit?: unknown }[];
  recipeId?: unknown;
  servings?: unknown;
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const body = await readJson<Body>(request);
  if (!body) return Response.json({ error: "Invalid request." }, { status: 400 });

  const toAdd: { name: string; category: string; quantity: number | null; unit: GroceryUnit | null; sources?: { dayIndex: number; dayLabel: string; mealLabel: string; recipeId: string; recipeName: string }[] }[] = [];

  if (typeof body.recipeId === "string") {
    const recipe = getRecipe(body.recipeId);
    if (!recipe) return Response.json({ error: "That recipe could not be found." }, { status: 404 });
    const servings = typeof body.servings === "number" && Number.isFinite(body.servings) && body.servings > 0 && body.servings <= 10 ? body.servings : 1;
    if (!recipe.ingredients) {
      for (const name of recipe.ingredientNames) {
        toAdd.push({ name, category: categoryForIngredient(name), quantity: null, unit: null, sources: [{ dayIndex: -1, dayLabel: "Recipe", mealLabel: "", recipeId: recipe.id, recipeName: recipe.name }] });
      }
    } else {
      for (const ing of recipe.ingredients) {
        const base = toBase(ing.quantity * servings, ing.unit);
        const shown = presentQuantity(base.quantity, base.unit);
        toAdd.push({ name: ing.name, category: categoryForIngredient(ing.name), quantity: shown.quantity, unit: shown.unit, sources: [{ dayIndex: -1, dayLabel: "Recipe", mealLabel: "", recipeId: recipe.id, recipeName: recipe.name }] });
      }
    }
  } else if (Array.isArray(body.items)) {
    if (body.items.length === 0 || body.items.length > 50) return Response.json({ error: "Add between 1 and 50 items." }, { status: 400 });
    for (const raw of body.items) {
      const name = cleanName(raw.name);
      if (!name) return Response.json({ error: "Each item needs a name (up to 60 characters)." }, { status: 400 });
      const qty = parseQuantity(raw.quantity, raw.unit);
      if (typeof qty === "string") return Response.json({ error: qty }, { status: 400 });
      toAdd.push({ name: name.toLowerCase(), category: raw.category ? parseCategory(raw.category) : categoryForIngredient(name), ...qty });
    }
  } else {
    return Response.json({ error: "Provide items or a recipeId." }, { status: 400 });
  }

  try {
    const list = await addGroceryItems(user.id, toAdd);
    return Response.json({ list, added: toAdd.length }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
