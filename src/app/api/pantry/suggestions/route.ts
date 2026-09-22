/** Phase 4 — GET /api/pantry/suggestions → recipes that use pantry ingredients (restriction-filtered). */
import { currentUser, errorResponse, unauthorized } from "@/services/server/guard";
import { getProfile } from "@/services/server/repository";
import { listPantry } from "@/services/server/kitchenRepository";
import { recipesForPantry, toSummary } from "@/services/recipes/recipeService";
import { unitLabel } from "@/data/options";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  try {
    const [pantry, profile] = await Promise.all([listPantry(user.id), getProfile(user.id)]);
    const matches = recipesForPantry(pantry.map((p) => p.name), profile, 8);
    return Response.json({
      pantryNames: pantry.map((p) => p.name),
      suggestions: matches.map((m) => ({
        recipe: toSummary(m.recipe, `${m.recipe.servingSize.quantity} ${unitLabel(m.recipe.servingSize.unit)}`),
        matched: m.matched,
        missing: m.missing,
        coverage: Math.round(m.coverage * 100),
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
