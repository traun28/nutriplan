/**
 * Phase 6 — smart recommendations, selected from real data and capped at
 * a handful. Each item carries the factual reason it was chosen. The
 * ranking is a fixed priority list: missing actions that unblock the rest
 * of the app first, then today's nutrition, then convenience.
 */
import { AiContext } from "./contextBuilder";
import { suggestMeals, slotForHour, slotLabel, pantryRecipes } from "./tools";
import type { Recommendation } from "./types";
import { formatLitres } from "@/services/foodLog/water";

const r = (n: number) => Math.round(n);

export async function buildRecommendations(ctx: AiContext, limit = 4): Promise<Recommendation[]> {
  const out: Recommendation[] = [];
  const [profile, nutrition, mealPlan] = await Promise.all([ctx.profile(), ctx.nutrition(), ctx.mealPlan()]);
  const pantry = await ctx.pantry().catch(() => ({ items: [], names: [] }));
  const hour = ctx.clock.hour;

  /* 1. Blocking setup. */
  if (!profile.profile || !nutrition.hasTargets) {
    out.push({ id: "setup-targets", category: "nutrition", title: "Calculate your nutrition targets", detail: "Personalised suggestions need a calorie and protein target.", reason: "No calculated targets were found for your profile.", source: "Calculated", href: "/nutrition", cta: "Open nutrition" });
    return out.slice(0, limit);
  }

  /* 2. Plan coverage. */
  if (!mealPlan.plan) {
    out.push({ id: "no-plan", category: "plan", title: "Generate a 7-day meal plan", detail: "A plan lets NutriPlan compare planned and actual meals, build your grocery list and offer replacements.", reason: "You have no current meal plan.", source: "Planned", href: "/meal-plan", cta: "Open planner" });
  } else if (mealPlan.tomorrowIndex === null) {
    out.push({ id: "plan-tomorrow", category: "plan", title: "Your plan doesn't cover tomorrow", detail: `"${mealPlan.plan.name}" ends before tomorrow. Generate a new plan or shift its start date.`, reason: "Tomorrow's date falls outside the current plan's range.", source: "Planned", href: "/meal-plan", cta: "Open 7-day plan" });
  }

  /* 3. Today's nutrition. */
  const remCal = nutrition.remaining.calories ?? 0;
  const remProt = nutrition.remaining.protein ?? 0;
  if (nutrition.entries.length > 0 && nutrition.targets.protein && remProt > nutrition.targets.protein * 0.4 && hour >= 14) {
    out.push({ id: "protein-gap", category: "nutrition", title: "Logged protein is below today's target so far", detail: `${r(nutrition.totals.protein)} g of ${r(nutrition.targets.protein)} g logged; ${r(remProt)} g to go.`, reason: "Based on the foods logged today compared with your configured protein target.", source: "Logged", prompt: "Suggest a high-protein meal that fits my remaining targets", cta: "Ask for ideas" });
  }
  if (remCal > 150 || nutrition.entries.length === 0) {
    const slot = slotForHour(hour);
    const [card] = suggestMeals(profile, nutrition, ctx.clock.today, { slot, limit: 1, excludeIds: nutrition.entries.map((e) => e.foodId), preferIngredients: pantry.names });
    if (card) {
      out.push({ id: `meal-${card.foodId}`, category: "meal", title: `Next up: ${card.name} for ${slotLabel(slot)}`, detail: `${r(card.calories)} kcal · ${r(card.proteinGrams)} g protein · ${card.prepMinutes} min`, reason: card.reason, source: "Reference", prompt: `Suggest ${slotLabel(slot)}`, cta: "See options" });
    }
  }

  /* 4. Pantry-based recipe. */
  if (pantry.names.length > 0) {
    const [recipe] = pantryRecipes(pantry.names, profile.profile, 1);
    if (recipe && recipe.matched.length >= 2) {
      out.push({ id: `pantry-${recipe.recipeId}`, category: "recipe", title: `You could make ${recipe.name}`, detail: `Uses ${recipe.matched.slice(0, 3).join(", ")} from your pantry${recipe.missing.length ? `; missing ${recipe.missing.slice(0, 2).join(", ")}` : ""}.`, reason: `${recipe.matched.length} of its ingredients are recorded in your pantry.`, source: "Logged", href: `/recipes/${recipe.recipeId}`, cta: "Open recipe" });
    }
  }

  /* 5. Grocery coverage for the plan. */
  if (mealPlan.plan) {
    const grocery = await ctx.grocery().catch(() => null);
    if (grocery && grocery.items.length > 0) {
      const outstanding = grocery.items.filter((i) => !i.purchased && !i.isCustom).length;
      if (outstanding >= 3) out.push({ id: "grocery", category: "grocery", title: `${outstanding} plan ingredients still to buy`, detail: "Your grocery list has items for the current plan that aren't marked purchased or covered by your pantry.", reason: "Counted from unpurchased, plan-generated grocery items.", source: "Logged", href: "/grocery", cta: "Show grocery list" });
    }
  }

  /* 6. Water. */
  if (hour >= 15 && nutrition.waterMl < nutrition.waterTargetMl * 0.4) {
    out.push({ id: "water", category: "water", title: "Water is behind your daily target", detail: `${formatLitres(nutrition.waterMl)} of ${formatLitres(nutrition.waterTargetMl)} logged so far.`, reason: "Compared with the water target in your settings (a tracking reference, not a medical requirement).", source: "Logged", prompt: "Add 250 ml water", cta: "Log 250 ml" });
  }

  return out.slice(0, limit);
}
