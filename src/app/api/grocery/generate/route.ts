/**
 * Phase 4 — POST /api/grocery/generate { mealPlanId?, dayIndexes?, usePantry? }
 * Builds the list from the user's saved plan (current plan by default),
 * subtracting compatible pantry stock, and replaces the generated items.
 */
import { currentUser, errorResponse, readJson, unauthorized } from "@/services/server/guard";
import { getCurrentMealPlan, getMealPlan } from "@/services/server/mealPlanRepository";
import { listPantry, replaceGeneratedItems } from "@/services/server/kitchenRepository";
import { buildGroceryItems } from "@/services/grocery/groceryBuilder";
import { parseDayIndex } from "@/services/diet/weeklyPlanner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const body = (await readJson<{ mealPlanId?: unknown; dayIndexes?: unknown; usePantry?: unknown }>(request)) ?? {};

  let dayIndexes: number[] | null = null;
  if (Array.isArray(body.dayIndexes)) {
    const parsed = body.dayIndexes.map(parseDayIndex);
    if (parsed.some((d) => d === null)) return Response.json({ error: "Day indexes must be between 0 and 6." }, { status: 400 });
    dayIndexes = Array.from(new Set(parsed as number[])).sort((a, b) => a - b);
    if (dayIndexes.length === 0) dayIndexes = null;
  }
  const usePantry = body.usePantry !== false;

  try {
    const plan =
      typeof body.mealPlanId === "number" && Number.isInteger(body.mealPlanId)
        ? await getMealPlan(user.id, body.mealPlanId)
        : await getCurrentMealPlan(user.id);
    if (!plan) {
      return Response.json(
        { error: "Generate a 7-day meal plan first — the grocery list is built from it.", code: "NO_PLAN" },
        { status: 409 },
      );
    }
    const pantry = usePantry ? await listPantry(user.id) : [];
    const { items, coveredByPantry } = buildGroceryItems(plan.data, {
      dayIndexes,
      pantry: pantry.map((p) => ({ name: p.name, quantity: p.quantity, unit: p.unit })),
    });
    const list = await replaceGeneratedItems(user.id, { mealPlanId: plan.id, dayIndexes, items });
    return Response.json({ list, coveredByPantry, planName: plan.name });
  } catch (error) {
    return errorResponse(error, "The grocery list could not be generated right now.");
  }
}
