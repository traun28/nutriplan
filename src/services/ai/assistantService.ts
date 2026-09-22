/**
 * Phase 6 — the assistant brain.
 *
 * 1. `detectIntent` classifies the message with deterministic rules.
 * 2. The intent handler loads only the context groups it needs and builds
 *    a grounded reply (numbers, cards and actions) from application data.
 * 3. When an external AI provider is configured, it is asked to phrase the
 *    prose for general/explanatory answers using ONLY the facts we hand it.
 *    The structured cards and figures always come from the application; if
 *    the provider is missing or fails, the grounded text is used as-is, so
 *    the assistant never goes dark.
 */
import { shiftDateKey } from "@/services/foodLog/calculations";
import { FOOD_BY_ID } from "@/data/foods/foodDatabase";
import { foodLogMealLabel } from "@/services/foodLog/types";
import { formatLitres } from "@/services/foodLog/water";
import { AiContext, summariseNutrition, summarisePantry, summariseProfile } from "./contextBuilder";
import { complete, providerInfo, AiProviderError } from "./provider";
import {
  findRecipes,
  foodCardFor,
  isFoodSafeFor,
  isPlannerSlot,
  lookupFood,
  pantryRecipes,
  replacementOptions,
  slotForHour,
  slotLabel,
  suggestMeals,
} from "./tools";
import type { AssistantAction, AssistantCard, AssistantReply, DataSourceLabel, StatCard } from "./types";
import type { PlannerSlot } from "@/services/diet/config";
import type { MealId } from "@/types/profile";

/* ------------------------------------------------------------------ */
/* Intents                                                             */
/* ------------------------------------------------------------------ */

export type Intent =
  | { id: "help" }
  | { id: "greeting" }
  | { id: "remaining" }
  | { id: "explain_day" }
  | { id: "explain_week" }
  | { id: "why_low"; nutrient: "protein" | "calories" | "carbohydrates" | "fat" }
  | { id: "suggest_meal"; slot: PlannerSlot; highProtein: boolean; quick: boolean; query: string }
  | { id: "plan_day"; offset: 0 | 1 }
  | { id: "replace_meal"; slot: PlannerSlot | null; offset: 0 | 1 }
  | { id: "pantry" }
  | { id: "recipes"; query: string; quick: boolean; highProtein: boolean; slot: PlannerSlot | null }
  | { id: "log_food"; food: string; slot: MealId | null }
  | { id: "water"; amountMl: number | null }
  | { id: "show"; target: "planner" | "logger" | "grocery" | "pantry" | "analytics" | "progress" | "recipes" | "plan" }
  | { id: "safety" }
  | { id: "general" };

const SLOT_WORDS: [RegExp, PlannerSlot][] = [
  [/\bbreakfast\b/i, "breakfast"],
  [/\bmorning snack\b/i, "morningSnack"],
  [/\blunch\b/i, "lunch"],
  [/\b(evening snack|snack)\b/i, "eveningSnack"],
  [/\b(dinner|supper|tonight)\b/i, "dinner"],
];

function slotIn(text: string): PlannerSlot | null {
  for (const [re, slot] of SLOT_WORDS) if (re.test(text)) return slot;
  return null;
}

const SAFETY_RE = /\b(diagnos\w*|diabet\w*|disease|medicat\w*|medicine|prescri\w*|supplement\w*|thyroid|cholesterol|blood pressure|pregnan\w*|kidney|liver|cancer|eating disorder|anorexi\w*|bulimi\w*|chest pain|emergency|insulin|pcos|hypertension)\b/i;

export function detectIntent(raw: string, hour: number): Intent {
  const t = raw.trim().toLowerCase().replace(/[?!.,;:]+/g, " ").replace(/\s+/g, " ").trim();
  const tomorrow = /\btomorrow\b/.test(t) ? 1 : 0;
  const quick = /\b(quick|fast|easy|simple|15 ?min|20 ?min)\b/.test(t);
  const highProtein = /\b(high[- ]?protein|more protein|protein[- ]rich)\b/.test(t);
  const slot = slotIn(t);

  if (/^(hi|hello|hey|good (morning|afternoon|evening))\b/.test(t)) return { id: "greeting" };
  if (/\b(help|what can you do|commands)\b/.test(t)) return { id: "help" };
  if (SAFETY_RE.test(t) && !/\b(protein|calorie|carb|fat|fiber|fibre)\b.*\bwhat is\b/.test(t)) return { id: "safety" };

  if (/\b(what('| i)?s left|remaining|left in my|how (much|many) more|calories? left|protein left)\b/.test(t)) return { id: "remaining" };
  if (/\b(weekly|this week|week('s)?)\b.*\b(nutrition|report|summary|explain|analy)/.test(t) || /\bexplain\b.*\bweek/.test(t)) return { id: "explain_week" };
  if (/\bwhy\b.*\b(protein|calorie|carb|fat)\b.*\b(low|high|under|over|short)\b/.test(t) || /\bwhy is my\b/.test(t)) {
    const nutrient = /protein/.test(t) ? "protein" : /carb/.test(t) ? "carbohydrates" : /fat/.test(t) ? "fat" : "calories";
    return { id: "why_low", nutrient };
  }
  if (/\b(explain|analy[sz]e|analysis|review|how (am|did) i (do|doing)|summari[sz]e)\b.*\b(nutrition|today|intake|day|eating)\b/.test(t) || /\b(show|check) my nutrition\b/.test(t)) return { id: "explain_day" };

  if (/\b(replace|swap|change|substitute|alternative)\b/.test(t) && (slot || /\bmeal\b/.test(t))) return { id: "replace_meal", slot, offset: tomorrow };
  if (/\b(pantry|what can i (make|cook)|what('s| is) in my (kitchen|fridge)|from what i have)\b/.test(t)) return { id: "pantry" };
  if (/\b(grocery|shopping list)\b/.test(t)) return { id: "show", target: "grocery" };

  const logMatch = t.match(/\b(?:log|record|track|add|i ate|i had)\s+(?:some\s+|a\s+|an\s+|the\s+)?(.+?)(?:\s+(?:for|as|at|to)\s+(?:my\s+)?(breakfast|morning snack|lunch|evening snack|snack|dinner))?\s*$/);
  if (logMatch && !/\b(water|ml|litre|liter|glass)\b/.test(t)) {
    const mealWord = logMatch[2];
    const mealId: MealId | null = mealWord ? (slotIn(mealWord) ?? null) : null;
    return { id: "log_food", food: logMatch[1].trim(), slot: mealId };
  }
  const water = t.match(/(\d+(?:\.\d+)?)\s*(ml|millilit\w*|litres?|liters?|l\b|glass(?:es)?|cups?)/);
  if (/\bwater\b|\bhydrat/.test(t) || water) {
    if (water) {
      const n = parseFloat(water[1]);
      const unit = water[2];
      const ml = /litre|liter|^l$/.test(unit) ? n * 1000 : /glass|cup/.test(unit) ? n * 250 : n;
      return { id: "water", amountMl: Math.round(ml) };
    }
    return { id: "water", amountMl: null };
  }

  if (/\b(generate|create|make|build|plan)\b.*\b(plan|meals? for (today|tomorrow)|my day|today'?s meals|tomorrow'?s meals)\b/.test(t) || /^plan (today|tomorrow)/.test(t)) return { id: "plan_day", offset: tomorrow };
  if (/\b(recipe|recipes|how (do|to) (i )?(make|cook))\b/.test(t)) {
    const q = t.replace(/\b(show|give|find|me|a|an|the|some|recipe|recipes|for|please|quick|fast|easy|high[- ]?protein|based on|using|with|my|pantry|of)\b/g, " ").replace(/\s+/g, " ").trim();
    return { id: "recipes", query: q, quick, highProtein, slot };
  }
  if (/\b(similar meal|same meal|something like)\b/.test(t)) return { id: "suggest_meal", slot: slot ?? slotForHour(hour), highProtein: highProtein || /protein/.test(t), quick, query: "" };
  if (/\b(suggest|recommend|idea|what should i (eat|have)|what (can|could) i eat|give me|options? for|something (for|to eat))\b/.test(t) || slot) {
    const chosen = slot ?? slotForHour(hour);
    const q = t.replace(/\b(suggest|recommend|give|me|a|an|the|some|for|today|tonight|please|quick|fast|easy|high[- ]?protein|breakfast|lunch|dinner|snack|meal|food|what|should|i|eat|have|can|could|options?|something|to|idea|ideas)\b/g, " ").replace(/\s+/g, " ").trim();
    return { id: "suggest_meal", slot: chosen, highProtein, quick, query: q };
  }
  if (/\b(open|show|go to|take me to)\b/.test(t)) {
    if (/plann?er|diet plan/.test(t)) return { id: "show", target: "planner" };
    if (/log|logger|food log/.test(t)) return { id: "show", target: "logger" };
    if (/analytic|analysis/.test(t)) return { id: "show", target: "analytics" };
    if (/progress|weight/.test(t)) return { id: "show", target: "progress" };
    if (/recipe/.test(t)) return { id: "show", target: "recipes" };
    if (/7[- ]day|weekly plan|meal plan/.test(t)) return { id: "show", target: "plan" };
  }
  return { id: "general" };
}

/* ------------------------------------------------------------------ */
/* Reply helpers                                                       */
/* ------------------------------------------------------------------ */

const nav = (label: string, href: string): AssistantAction => ({ type: "navigate", label, href });
const r = (n: number) => Math.round(n).toString();

function reply(text: string, extra: Partial<AssistantReply> = {}): AssistantReply {
  return { text, scope: "personal", sources: ["Logged", "Calculated"], cards: [], actions: [], aiGenerated: false, followUps: [], ...extra };
}

const NO_TARGETS = "Your nutrition targets haven't been calculated yet, so I can't compare today's intake against them. Calculate your nutrition first and I'll take it from there.";

/* ------------------------------------------------------------------ */
/* Handlers                                                            */
/* ------------------------------------------------------------------ */

async function handleRemaining(ctx: AiContext): Promise<AssistantReply> {
  const n = await ctx.nutrition();
  if (!n.hasTargets) return reply(NO_TARGETS, { actions: [nav("Calculate nutrition", "/nutrition")], sources: ["Calculated"] });
  if (n.entries.length === 0) {
    return reply(
      `Nothing has been logged today yet, so your full targets are still available: ${r(n.targets.calories!)} kcal, ${r(n.targets.protein ?? 0)} g protein, ${r(n.targets.carbohydrates ?? 0)} g carbs and ${r(n.targets.fat ?? 0)} g fat. Log a meal and I'll keep the running total.`,
      { actions: [nav("Log food", "/dashboard?log=1")], followUps: ["Suggest a meal", "Plan today's meals"] },
    );
  }
  const rows = [
    { label: "Calories", value: `${r(n.remaining.calories ?? 0)} kcal left`, hint: `${r(n.totals.calories)} of ${r(n.targets.calories!)} kcal logged` },
    { label: "Protein", value: `${r(n.remaining.protein ?? 0)} g left`, hint: `${r(n.totals.protein)} of ${r(n.targets.protein ?? 0)} g logged` },
    { label: "Carbs", value: `${r(n.remaining.carbohydrates ?? 0)} g left`, hint: `${r(n.totals.carbohydrates)} of ${r(n.targets.carbohydrates ?? 0)} g logged` },
    { label: "Fat", value: `${r(n.remaining.fat ?? 0)} g left`, hint: `${r(n.totals.fat)} of ${r(n.targets.fat ?? 0)} g logged` },
  ];
  const overNote = n.over.calories > 0 ? ` You're ${r(n.over.calories)} kcal above today's calorie target.` : "";
  const card: StatCard = { kind: "stats", title: "Remaining today", rows, source: "Calculated" };
  return reply(
    `Based on ${n.entries.length} logged ${n.entries.length === 1 ? "entry" : "entries"}, you have about ${r(n.remaining.calories ?? 0)} kcal and ${r(n.remaining.protein ?? 0)} g protein left today.${overNote}`,
    { cards: [card], followUps: ["Suggest a meal that fits", "Explain my nutrition today"] },
  );
}

async function handleExplainDay(ctx: AiContext): Promise<AssistantReply> {
  const a = await ctx.dailyAnalytics();
  if (a.entryCount === 0) {
    return reply("No nutrition analysis is available for today yet — nothing has been logged. Once you log a meal I can explain calories, protein, carbs, fat and any potential gaps.", {
      actions: [nav("Log food", "/dashboard?log=1"), nav("Open analytics", "/analytics")],
      sources: ["Logged"],
    });
  }
  const gaps = a.assessments.filter((x) => x.status === "gap");
  const excess = a.assessments.filter((x) => x.status === "excess");
  const good = a.assessments.filter((x) => x.status === "on_target");
  const lines: string[] = [];
  lines.push(`So far today you've logged ${a.entryCount} ${a.entryCount === 1 ? "item" : "items"}: ${r(a.totals.calories)} kcal, ${r(a.totals.protein)} g protein, ${r(a.totals.carbohydrates)} g carbs and ${r(a.totals.fat)} g fat.`);
  if (!a.hasTargets) lines.push("Targets aren't calculated yet, so I can't say how that compares.");
  else {
    if (good.length) lines.push(`On target: ${good.map((g) => g.label.toLowerCase()).join(", ")}.`);
    if (gaps.length) lines.push(`Potential gaps: ${gaps.map((g) => `${g.label.toLowerCase()} (${r(g.estimated ?? 0)} of ${r(g.target ?? 0)}${g.unit})`).join(", ")}.`);
    if (excess.length) lines.push(`Above target: ${excess.map((g) => `${g.label.toLowerCase()} (${r(g.estimated ?? 0)} of ${r(g.target ?? 0)}${g.unit})`).join(", ")}.`);
  }
  const proteinMeals = a.nutrients.find((x) => x.key === "protein");
  if (proteinMeals?.explanation) lines.push(proteinMeals.explanation);
  if (a.plannedVsActual) lines.push(`${a.plannedVsActual.loggedCount} of ${a.plannedVsActual.plannedCount} planned meals logged.`);
  lines.push("Fibre isn't available in the food database, so it isn't included.");
  const card: StatCard = {
    kind: "stats",
    title: "Today vs targets",
    source: "Calculated",
    rows: a.assessments.filter((x) => x.key !== "fiber").map((x) => ({ label: x.label, value: `${r(x.estimated ?? 0)}${x.unit}`, hint: x.target !== null ? `target ${r(x.target)}${x.unit} · ${x.status === "gap" ? "potential gap" : x.status === "excess" ? "above target" : x.status === "on_target" ? "on target" : "no target"}` : "no target" })),
  };
  return reply(lines.join(" "), {
    cards: [card],
    actions: [nav("Open analytics", "/analytics")],
    followUps: gaps.length ? [`Why is my ${gaps[0].label.toLowerCase()} low?`, "Suggest a meal that fits"] : ["What's left today?", "Explain my weekly nutrition"],
  });
}

async function handleWhyLow(ctx: AiContext, nutrient: "protein" | "calories" | "carbohydrates" | "fat"): Promise<AssistantReply> {
  const a = await ctx.dailyAnalytics();
  const label = { protein: "protein", calories: "calories", carbohydrates: "carbs", fat: "fat" }[nutrient];
  if (a.entryCount === 0) return reply(`I don't have enough logged food data to say anything about today's ${label} — nothing has been logged yet.`, { actions: [nav("Log food", "/dashboard?log=1")], sources: ["Logged"] });
  const assessment = a.assessments.find((x) => x.key === nutrient);
  const detail = a.nutrients.find((x) => x.key === nutrient);
  if (!assessment || assessment.target === null) return reply(NO_TARGETS, { actions: [nav("Calculate nutrition", "/nutrition")] });
  const foods = (detail?.foods ?? []).slice(0, 3).map((f) => `${f.foodName} (${r(f.amount)}${assessment.unit})`).join(", ");
  const status = assessment.status === "gap" ? `is below target: ${r(assessment.estimated ?? 0)} of ${r(assessment.target)}${assessment.unit} (${assessment.percentOfTarget ?? 0}%)` : assessment.status === "excess" ? `is above target: ${r(assessment.estimated ?? 0)} of ${r(assessment.target)}${assessment.unit}` : `is on target: ${r(assessment.estimated ?? 0)} of ${r(assessment.target)}${assessment.unit}`;
  const lines = [`Today's ${label} ${status}. This is based only on the ${a.entryCount} ${a.entryCount === 1 ? "item" : "items"} logged so far.`];
  if (detail?.explanation) lines.push(detail.explanation);
  if (foods) lines.push(`Largest contributors: ${foods}.`);
  const cards: AssistantCard[] = [];
  if (assessment.status === "gap" && detail?.suggestions.length) {
    lines.push("Foods from the database that would add more, and pass your restriction settings:");
    for (const s of detail.suggestions.slice(0, 3)) {
      const food = FOOD_BY_ID.get(s.foodId);
      if (food) cards.push(foodCardFor(food, 1, slotForHour(ctx.clock.hour), ctx.clock.today, `Adds about ${r(s.amount)}${assessment.unit} of ${label} per serving.`));
    }
  }
  return reply(lines.join(" "), { cards, actions: [nav("Open analytics", "/analytics")], followUps: ["Suggest a meal that fits", "What's left today?"] });
}

async function handleExplainWeek(ctx: AiContext): Promise<AssistantReply> {
  const w = await ctx.weeklyAnalytics();
  const days = w.averages.daysWithFood;
  if (days === 0) return reply("More data is needed to show a weekly trend — no meals were logged this week yet.", { actions: [nav("Open analytics", "/analytics?view=week")], sources: ["Logged"] });
  const av = w.averages;
  const lines = [`This week (${w.range.start} to ${w.range.end}) you logged food on ${days} of 7 days. On those days you averaged ${r(av.calories ?? 0)} kcal, ${r(av.protein ?? 0)} g protein, ${r(av.carbohydrates ?? 0)} g carbs and ${r(av.fat ?? 0)} g fat.`];
  if (w.hasTargets && w.targets.calories) {
    const diff = (av.calories ?? 0) - w.targets.calories;
    lines.push(`That's ${r(Math.abs(diff))} kcal ${diff >= 0 ? "above" : "below"} your ${r(w.targets.calories)} kcal daily target on average.`);
  }
  if (av.waterMl !== null) lines.push(`Water averaged ${formatLitres(av.waterMl)} on days it was logged, against a ${formatLitres(w.waterTargetMl)} target.`);
  const cmp = w.comparison.rows?.filter((row) => row.change !== null && row.previous !== null) ?? [];
  if (cmp.length) lines.push(`Compared with the previous week: ${cmp.slice(0, 3).map((row) => `${row.label.toLowerCase()} ${row.change! >= 0 ? "up" : "down"} ${r(Math.abs(row.change!))} ${row.unit}`).join(", ")}.`);
  else lines.push("There isn't enough logged data from the previous week for a comparison.");
  if (days < 7) lines.push(`Days without logs are shown as gaps, not as zero intake.`);
  const card: StatCard = {
    kind: "stats",
    title: "Weekly averages (logged days)",
    source: "Calculated",
    rows: [
      { label: "Calories", value: `${r(av.calories ?? 0)} kcal` },
      { label: "Protein", value: `${r(av.protein ?? 0)} g` },
      { label: "Carbs", value: `${r(av.carbohydrates ?? 0)} g` },
      { label: "Fat", value: `${r(av.fat ?? 0)} g` },
      { label: "Days logged", value: `${days} of 7` },
    ],
  };
  return reply(lines.join(" "), { cards: [card], actions: [nav("Open weekly analytics", "/analytics?view=week")], followUps: ["Explain my nutrition today", "Suggest a meal"] });
}

async function handleSuggest(ctx: AiContext, intent: Extract<Intent, { id: "suggest_meal" }>): Promise<AssistantReply> {
  const [profile, nutrition, pantry] = await Promise.all([ctx.profile(), ctx.nutrition(), ctx.pantry().catch(() => ({ items: [], names: [] }))]);
  const cards = suggestMeals(profile, nutrition, ctx.clock.today, { slot: intent.slot, highProtein: intent.highProtein, quick: intent.quick, query: intent.query, excludeIds: nutrition.entries.map((e) => e.foodId), preferIngredients: pantry.names });
  if (cards.length === 0) return reply(`I couldn't find a ${slotLabel(intent.slot)} in the food database that passes your restriction settings${intent.query ? ` and matches "${intent.query}"` : ""}. Try a broader request.`, { sources: ["Reference"] });
  const basis = !nutrition.hasTargets
    ? "Targets aren't calculated yet, so these are sized to a typical portion."
    : nutrition.entries.length === 0
      ? `Nothing is logged yet today, so these are sized against your ${r(nutrition.targets.calories!)} kcal daily target.`
      : `You have about ${r(nutrition.remaining.calories ?? 0)} kcal and ${r(nutrition.remaining.protein ?? 0)} g protein left today.`;
  const restrict = [profile.dietaryLabel, ...profile.allergies.map((a) => `no ${a.toLowerCase()}`)].filter(Boolean).join(", ");
  return reply(`${basis} Here are ${cards.length} ${intent.highProtein ? "higher-protein " : ""}${intent.quick ? "quick " : ""}${slotLabel(intent.slot)} options from the food database${restrict ? ` (${restrict})` : ""}. Nutrition values are per the shown portion.`, {
    cards,
    sources: ["Reference", "Calculated"],
    followUps: [`Replace today's ${slotLabel(intent.slot)}`, "What's left today?"],
  });
}

async function handlePlanDay(ctx: AiContext, offset: 0 | 1): Promise<AssistantReply> {
  const { plan, todayIndex, tomorrowIndex } = await ctx.mealPlan();
  const which = offset === 0 ? "today" : "tomorrow";
  const idx = offset === 0 ? todayIndex : tomorrowIndex;
  if (plan && idx !== null) {
    const day = plan.data.days.find((d) => d.dayIndex === idx);
    if (day) {
      const rows = day.plan.meals.map((m) => ({ label: m.label, value: m.name, hint: `${r(m.calories)} kcal · ${r(m.proteinGrams)} g protein` }));
      return reply(`Your current plan "${plan.name}" already covers ${which} (${day.label}): ${day.plan.meals.map((m) => `${m.label.toLowerCase()} — ${m.name}`).join("; ")}. Total ${r(day.plan.dailyTotals.calories)} kcal and ${r(day.plan.dailyTotals.protein)} g protein.`, {
        cards: [{ kind: "stats", title: `${which[0].toUpperCase()}${which.slice(1)}'s planned meals`, rows, source: "Planned" }],
        actions: [nav("Open 7-day plan", "/meal-plan")],
        sources: ["Planned"],
        followUps: [`Replace ${which}'s dinner`, "What's left today?"],
      });
    }
  }
  const text = plan
    ? `Your current plan "${plan.name}" doesn't include ${which} — its dates don't cover it. You can generate a new 7-day plan or change the plan's start date in the planner.`
    : `You don't have a current meal plan yet. The 7-day planner builds one from your profile and targets; I can take you there.`;
  const [profile, nutrition] = await Promise.all([ctx.profile(), ctx.nutrition()]);
  const cards = suggestMeals(profile, nutrition, ctx.clock.today, { slot: slotForHour(ctx.clock.hour), limit: 2 });
  return reply(`${text}${cards.length ? ` In the meantime, here are two options for your next meal.` : ""}`, { cards, actions: [nav("Generate a 7-day plan", "/meal-plan")], sources: ["Planned", "Reference"] });
}

async function handleReplace(ctx: AiContext, intent: Extract<Intent, { id: "replace_meal" }>): Promise<AssistantReply> {
  const slot = intent.slot ?? slotForHour(ctx.clock.hour);
  const which = intent.offset === 0 ? "today" : "tomorrow";
  const res = await replacementOptions(ctx, slot, intent.offset);
  if (!res.ok) {
    const msgs = {
      no_plan: "Create a meal plan to compare planned and actual nutrition — there's no current 7-day plan to replace a meal in.",
      no_profile: "Complete your profile first so replacements can respect your restrictions.",
      day_not_in_plan: `Your current plan doesn't cover ${which}. Adjust the plan's start date or generate a new plan.`,
      slot_missing: `There's no ${slotLabel(slot)} in ${which}'s plan to replace.`,
    };
    return reply(msgs[res.reason], { actions: [nav("Open 7-day plan", "/meal-plan")], sources: ["Planned"] });
  }
  if (res.cards.length === 0) return reply(`I couldn't find a safe alternative for ${which}'s ${slotLabel(slot)} (${res.current.name}) in the food database.`, { sources: ["Planned", "Reference"] });
  return reply(`${which[0].toUpperCase()}${which.slice(1)}'s planned ${slotLabel(slot)} is ${res.current.name} (${r(res.current.calories)} kcal, ${r(res.current.proteinGrams)} g protein). These alternatives pass your restriction settings and are ranked by the planner; pick one and I'll apply it through the plan.`, {
    cards: res.cards,
    actions: [nav("Open 7-day plan", "/meal-plan")],
    sources: ["Planned", "Calculated"],
    followUps: ["Explain my nutrition today"],
  });
}

async function handlePantry(ctx: AiContext): Promise<AssistantReply> {
  const [pantry, profile] = await Promise.all([ctx.pantry(), ctx.profile()]);
  if (pantry.names.length === 0) return reply("Your pantry is empty, so I can't suggest anything from it. Add the items you have and I'll match them to recipes.", { actions: [nav("Open pantry", "/pantry")], sources: ["Logged"] });
  const cards = pantryRecipes(pantry.names, profile.profile, 4);
  const have = pantry.names.slice(0, 6).join(", ") + (pantry.names.length > 6 ? ` and ${pantry.names.length - 6} more` : "");
  if (cards.length === 0) return reply(`You have ${have}. None of the recipes in the database that pass your restriction settings use those ingredients, so I can't suggest a match right now.`, { actions: [nav("Browse recipes", "/recipes")], sources: ["Logged", "Reference"] });
  return reply(`You have ${have}. Here are recipes from the database that use what you've recorded — I only count ingredients that are actually in your pantry; anything missing is listed on each card.`, {
    cards,
    actions: [nav("Open pantry", "/pantry"), nav("Show grocery list", "/grocery")],
    sources: ["Logged", "Reference"],
    followUps: ["Suggest dinner", "Show my grocery list"],
  });
}

async function handleRecipes(ctx: AiContext, intent: Extract<Intent, { id: "recipes" }>): Promise<AssistantReply> {
  const profile = await ctx.profile();
  const favorites: string[] = await ctx.favoriteRecipeIds().catch(() => []);
  let cards = findRecipes(intent.query, profile.profile, { slot: intent.slot ?? undefined, quick: intent.quick, highProtein: intent.highProtein, limit: 4 });
  let note = "";
  if (cards.length === 0 && intent.query) {
    cards = findRecipes("", profile.profile, { slot: intent.slot ?? undefined, quick: intent.quick, highProtein: intent.highProtein, limit: 4 });
    note = `Nothing in the recipe database matches "${intent.query}", so here are other recipes that pass your restriction settings. `;
  }
  if (cards.length === 0) return reply("There isn't a recipe in the database that matches that and passes your restriction settings.", { actions: [nav("Browse recipes", "/recipes")], sources: ["Reference"] });
  const fav = cards.filter((c) => favorites.includes(c.recipeId)).length;
  return reply(`${note}Here are ${cards.length} recipes from NutriPlan's recipe database${fav ? ` (${fav} already in your favourites)` : ""}. Nutrition values are the database's per-serving figures; recipes marked as summary-only don't have step-by-step instructions yet.`, {
    cards,
    actions: [nav("Browse all recipes", "/recipes")],
    sources: ["Reference"],
    followUps: ["What can I make with my pantry?", "Suggest dinner"],
  });
}

async function handleLogFood(ctx: AiContext, intent: Extract<Intent, { id: "log_food" }>): Promise<AssistantReply> {
  if (/^(this|that|the|my|planned|next)?\s*(meal|one|it)$/.test(intent.food) || intent.food === "meal") {
    const [{ plan, todayIndex }, n] = await Promise.all([ctx.mealPlan(), ctx.nutrition()]);
    const day = plan && todayIndex !== null ? plan.data.days.find((d) => d.dayIndex === todayIndex) : null;
    const logged = new Set(n.entries.map((e) => e.mealType));
    const next = day?.plan.meals.find((m) => !logged.has(m.type));
    if (!next) return reply(day ? "Every planned meal for today is already logged." : "Tell me which food to log (for example \"log idli for breakfast\"), or open the logger.", { actions: [nav("Open food logger", "/dashboard?log=1")], sources: ["Planned", "Logged"] });
    const cards = next.items.map((item) => {
      const food = FOOD_BY_ID.get(item.foodId);
      return food ? foodCardFor(food, item.servings, next.type, ctx.clock.today, `From your plan's ${next.label.toLowerCase()} (${item.portionLabel}).`) : null;
    }).filter((c): c is NonNullable<typeof c> => c !== null);
    return reply(`Your next unlogged planned meal today is ${next.label.toLowerCase()}: ${next.name} (${r(next.calories)} kcal, ${r(next.proteinGrams)} g protein). Confirm to log it as planned.`, { cards, sources: ["Planned"] });
  }
  const food = lookupFood(intent.food);
  if (!food) return reply(`I couldn't find "${intent.food}" in the food database, and I can only log foods that have verified nutrition data. Try the food logger's search to browse what's available.`, { actions: [nav("Open food logger", "/dashboard?log=1")], sources: ["Reference"] });
  const profile = await ctx.profile();
  const safe = isFoodSafeFor(food.id, profile.profile);
  const mealType: MealId = intent.slot ?? slotForHour(ctx.clock.hour);
  const warn = safe.ok ? "" : ` Heads up: ${safe.reason} You can still log it if you ate it.`;
  const card = foodCardFor(food, 1, mealType, ctx.clock.today, `Per 1 serving (${food.servingSize.quantity} ${food.servingSize.unit}). Confirm to add it to your ${foodLogMealLabel(mealType).toLowerCase()} log for today.`);
  return reply(`I found ${food.name}: ${r(food.calories)} kcal, ${r(food.proteinGrams)} g protein per serving.${warn} Confirm below to log it as ${foodLogMealLabel(mealType).toLowerCase()}.`, { cards: [card], sources: ["Reference"] });
}

async function handleWater(ctx: AiContext, amountMl: number | null): Promise<AssistantReply> {
  const n = await ctx.nutrition();
  if (amountMl === null) {
    return reply(`You've logged ${formatLitres(n.waterMl)} of water today against a ${formatLitres(n.waterTargetMl)} target. Say "add 250 ml water" to log more.`, { actions: [nav("Open dashboard", "/dashboard")], sources: ["Logged"] });
  }
  if (amountMl < 10 || amountMl > 5000) return reply("Please give an amount between 10 ml and 5000 ml.", { sources: ["Logged"] });
  return reply(`Adding ${amountMl} ml would bring today's water to ${formatLitres(n.waterMl + amountMl)}. Confirm below to log it.`, {
    actions: [{ type: "add_water", label: `Add ${amountMl} ml water`, amountMl, logDate: ctx.clock.today }],
    sources: ["Logged"],
  });
}

function handleShow(target: Extract<Intent, { id: "show" }>["target"]): AssistantReply {
  const map = {
    planner: ["Opening the diet planner.", "Open diet planner", "/planner"],
    logger: ["Opening the food logger on your dashboard.", "Open food logger", "/dashboard?log=1"],
    grocery: ["Your grocery list is built from your meal plan and pantry; here it is.", "Show grocery list", "/grocery"],
    pantry: ["Here's your pantry.", "Open pantry", "/pantry"],
    analytics: ["Here's your nutrition analysis.", "Open analytics", "/analytics"],
    progress: ["Here's your progress tracking.", "Open progress", "/progress"],
    recipes: ["Here are the recipes.", "Browse recipes", "/recipes"],
    plan: ["Here's your 7-day meal plan.", "Open 7-day plan", "/meal-plan"],
  } as const;
  const [text, label, href] = map[target];
  return reply(text, { actions: [nav(label, href)], sources: [], scope: "personal" });
}

function handleHelp(): AssistantReply {
  return reply(
    "I can work with your real NutriPlan data. Try:\n• \"What's left in my calorie target today?\"\n• \"Suggest a high-protein lunch\" or \"Show me a quick dinner\"\n• \"Replace today's dinner\" (uses your 7-day plan)\n• \"Explain my nutrition today\" / \"Explain my weekly nutrition\"\n• \"What can I make with my pantry?\"\n• \"Give me a recipe\"\n• \"Log idli for breakfast\" or \"Add 250 ml water\"\n• General questions like \"What is protein?\"\nEvery figure comes from your logs, your plan and the food database — I don't invent numbers.",
    { scope: "general", sources: [] },
  );
}

function handleSafety(): AssistantReply {
  return reply(
    "I can help with everyday nutrition planning — meals, targets, logging and your plan — but I can't diagnose conditions, recommend medication or supplements as treatment, or replace advice from a doctor or registered dietitian. For anything involving a medical condition, symptoms or treatment, please speak with a qualified healthcare professional. If you'd like, I can still help with meal ideas that fit your saved dietary preferences.",
    { scope: "general", sources: [], followUps: ["Suggest a meal", "What's left today?"] },
  );
}

/* General educational fallback (deterministic; AI prose if configured). */
const GENERAL_FACTS: [RegExp, string][] = [
  [/\bprotein\b/, "Protein is one of the three macronutrients. It supplies about 4 kcal per gram and provides amino acids the body uses to build and repair tissue. Common sources include dals and legumes, dairy, eggs, fish, poultry, soy, nuts and seeds. Your personal protein target in NutriPlan is calculated from your profile; ask \"what's my protein target\" to see it."],
  [/\bcarb/, "Carbohydrates are a macronutrient providing about 4 kcal per gram and are the body's most readily used energy source. They include starches (grains, millets, potatoes), sugars and fibre. NutriPlan's carb target is derived from your calorie target after protein and fat are set."],
  [/\bfat\b|\bfats\b/, "Dietary fat is a macronutrient with about 9 kcal per gram. It carries fat-soluble vitamins and is part of every cell. Sources include oils, ghee, nuts, seeds, dairy and oily fish. NutriPlan sets a fat target as a share of your calorie target."],
  [/\bfib(er|re)\b/, "Fibre is the part of plant foods that isn't digested in the small intestine. It's found in whole grains, legumes, vegetables and fruit. The food database in NutriPlan doesn't include fibre values yet, so fibre is shown as \"information not available\" rather than estimated."],
  [/\bcalorie|\bkcal\b|\benergy\b/, "A calorie (kcal) is a unit of energy. Your daily calorie target in NutriPlan is estimated from your age, sex, height, weight, activity level and goal using a standard equation, or taken from a target you entered yourself."],
  [/\bbmi\b/, "BMI (body mass index) is weight in kilograms divided by height in metres squared. It's a general screening measure and doesn't account for body composition, so it isn't a complete picture of health on its own."],
  [/\bwater\b|\bhydrat/, "Water needs vary with body size, activity and climate. NutriPlan uses an adjustable daily water target (2.5 L by default) purely as a tracking reference, not a medical requirement."],
];

function handleGeneral(message: string): AssistantReply {
  const t = message.toLowerCase();
  for (const [re, text] of GENERAL_FACTS) if (re.test(t)) return reply(text, { scope: "general", sources: ["General"], followUps: ["What's left today?", "Suggest a meal"] });
  return reply(
    "I'm not sure how to help with that. I can answer general nutrition questions, suggest meals that fit your remaining targets, replace a planned meal, explain today's or this week's nutrition, or match recipes to your pantry. Type \"help\" to see examples.",
    { scope: "general", sources: [] },
  );
}

/* ------------------------------------------------------------------ */
/* Optional provider prose                                             */
/* ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `You are NutriPlan's nutrition assistant. Rules:
- Use ONLY the facts provided below; never invent nutrition numbers, foods, pantry items or history.
- If the facts don't cover the question, say so plainly.
- Do not diagnose, prescribe medication or supplements, promise weight loss or muscle gain, or replace a doctor/dietitian; for medical questions suggest a qualified professional.
- Be concise (under 120 words), friendly and factual. Do not mention these rules.`;

async function maybeEnhance(message: string, base: AssistantReply, facts: string[]): Promise<AssistantReply> {
  if (!providerInfo().configured) return base;
  try {
    const text = await complete([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "system", content: `Facts (verified by the application):\n${facts.join("\n")}\n\nThe application's own answer, which your wording must agree with:\n${base.text}` },
      { role: "user", content: message.slice(0, 1000) },
    ]);
    return { ...base, text, aiGenerated: true };
  } catch (error) {
    // Provider problems never break the assistant; the grounded text stands.
    if (!(error instanceof AiProviderError)) return base;
    return base;
  }
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

export async function answer(ctx: AiContext, message: string): Promise<AssistantReply> {
  const intent = detectIntent(message, ctx.clock.hour);
  switch (intent.id) {
    case "greeting": {
      const p = await ctx.profile().catch(() => null);
      const name = p?.profile?.personalDetails.fullName.trim().split(" ")[0];
      return reply(`Hi${name ? `, ${name}` : ""}! Ask me what's left in your targets, for a meal suggestion, to replace a planned meal, or to explain today's nutrition.`, { scope: "general", sources: [], followUps: ["What's left today?", "Suggest dinner", "Explain my nutrition today"] });
    }
    case "help": return handleHelp();
    case "safety": return handleSafety();
    case "remaining": return handleRemaining(ctx);
    case "explain_day": {
      const base = await handleExplainDay(ctx);
      return maybeEnhance(message, base, [summariseNutrition(await ctx.nutrition()), summariseProfile(await ctx.profile())]);
    }
    case "explain_week": return maybeEnhance(message, await handleExplainWeek(ctx), []);
    case "why_low": return handleWhyLow(ctx, intent.nutrient);
    case "suggest_meal": return handleSuggest(ctx, intent);
    case "plan_day": return handlePlanDay(ctx, intent.offset);
    case "replace_meal": return handleReplace(ctx, intent);
    case "pantry": {
      const base = await handlePantry(ctx);
      return maybeEnhance(message, base, [summarisePantry(await ctx.pantry()), summariseProfile(await ctx.profile())]);
    }
    case "recipes": return handleRecipes(ctx, intent);
    case "log_food": return handleLogFood(ctx, intent);
    case "water": return handleWater(ctx, intent.amountMl);
    case "show": return handleShow(intent.target);
    case "general": {
      const base = handleGeneral(message);
      return maybeEnhance(message, base, ["This is a general educational question; no user data is required."]);
    }
  }
}

/** Title for a new conversation: the first user message, trimmed. */
export function titleFrom(message: string): string {
  const t = message.trim().replace(/\s+/g, " ");
  return t.length > 60 ? `${t.slice(0, 57)}…` : t || "New conversation";
}

export { isPlannerSlot, shiftDateKey };
export type { DataSourceLabel };
