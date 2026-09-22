/** Phase 4 — GET /api/recipes/:id → full recipe + (when signed in) restriction verdict and favourite flag. */
import { currentUser, notFound } from "@/services/server/guard";
import { getProfile } from "@/services/server/repository";
import { listRecipeFavoriteIds } from "@/services/server/kitchenRepository";
import { getRecipe, recipeConflicts } from "@/services/recipes/recipeService";
import { FOOD_BY_ID } from "@/data/foods/foodDatabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recipe = getRecipe(id);
  if (!recipe) return notFound("That recipe could not be found.");
  const user = await currentUser();
  let conflict: string | null = null;
  let favorite = false;
  if (user) {
    const profile = await getProfile(user.id);
    if (profile) conflict = recipeConflicts(FOOD_BY_ID.get(id)!, profile);
    try {
      favorite = (await listRecipeFavoriteIds(user.id)).includes(id);
    } catch {
      favorite = false;
    }
  }
  return Response.json({ recipe, conflict, favorite });
}
