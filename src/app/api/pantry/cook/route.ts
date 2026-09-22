/**
 * Phase 4 — POST /api/pantry/cook { recipeId, servings?, confirm?: true }
 * "Cooked this recipe": previews (confirm=false) or applies (confirm=true)
 * pantry deductions for ingredients whose units are compatible.
 */
import { currentUser, errorResponse, readJson, unauthorized } from "@/services/server/guard";
import { listPantry, updatePantryItem } from "@/services/server/kitchenRepository";
import { getRecipe } from "@/services/recipes/recipeService";
import { normaliseIngredientName } from "@/data/recipes/ingredientCatalog";
import { presentQuantity, round, toBase, unitsCompatible } from "@/services/grocery/units";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const body = await readJson<{ recipeId?: unknown; servings?: unknown; confirm?: unknown }>(request);
  const recipe = typeof body?.recipeId === "string" ? getRecipe(body.recipeId) : null;
  if (!recipe) return Response.json({ error: "That recipe could not be found." }, { status: 404 });
  if (!recipe.ingredients) {
    return Response.json({ error: "This recipe has no ingredient quantities, so the pantry cannot be updated automatically." }, { status: 422 });
  }
  const servings = typeof body?.servings === "number" && Number.isFinite(body.servings) && body.servings > 0 && body.servings <= 10 ? body.servings : 1;
  const confirm = body?.confirm === true;

  try {
    const pantry = await listPantry(user.id);
    const changes: { pantryId: number; name: string; before: string; after: string; deducted: string }[] = [];
    const skipped: { name: string; reason: string }[] = [];

    for (const ing of recipe.ingredients) {
      const name = normaliseIngredientName(ing.name);
      const need = toBase(ing.quantity * servings, ing.unit);
      const match = pantry.find((p) => normaliseIngredientName(p.name) === name);
      if (!match) continue;
      if (match.quantity === null || match.unit === null) {
        skipped.push({ name, reason: "no quantity recorded in the pantry" });
        continue;
      }
      if (!unitsCompatible(match.unit, need.unit)) {
        skipped.push({ name, reason: `pantry unit (${match.unit}) cannot be compared with ${need.unit}` });
        continue;
      }
      const have = toBase(match.quantity, match.unit);
      const afterBase = Math.max(0, have.quantity - need.quantity);
      const after = presentQuantity(afterBase, have.unit);
      const before = presentQuantity(have.quantity, have.unit);
      const deducted = presentQuantity(Math.min(have.quantity, need.quantity), have.unit);
      changes.push({
        pantryId: match.id,
        name,
        before: `${before.quantity} ${before.unit}`,
        after: `${round(after.quantity)} ${after.unit}`,
        deducted: `${deducted.quantity} ${deducted.unit}`,
      });
      if (confirm) await updatePantryItem(user.id, match.id, { quantity: after.quantity, unit: after.unit });
    }
    return Response.json({ applied: confirm, changes, skipped, servings });
  } catch (error) {
    return errorResponse(error);
  }
}
