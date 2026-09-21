/**
 * Part 13 — Personal Nutrition Assistant engine.
 *
 * A rule-based NLU system that reads the application's real state and
 * performs controlled actions. It is deterministic, local, and honest:
 *
 *   • READ queries return actual profile/plan/database values
 *   • WRITE actions (log food, replace meal, update water) require
 *     explicit user confirmation before being applied
 *   • Every response is grounded in real data — nothing is invented
 *
 * Intents:
 *   profile, nutrition, food_search, meal_replace, explain,
 *   shopping, log_food, hydration, attachment, general
 */
import type {
  UserProfile,
  ProcessedProfile,
  DietPlan,
  FoodItemRecord,
} from "../../types/profile.ts";
import type { AttachmentRecord } from "../../types/attachment.ts";
import { FOOD_DATABASE, FOOD_BY_ID } from "../../data/foods/foodDatabase.ts";
import { formatTime, labelFor } from "../../data/options.ts";


/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type ActionType = "read" | "write";

/**
 * A proposed WRITE action. The engine is pure and has no access to React
 * state, so it returns a serialisable descriptor; the AssistantContext —
 * which owns the real profile/plan mutators — executes it only after the
 * user confirms, and reports the genuine outcome.
 */
export type ProposedAction =
  | { kind: "replace_meal"; slot: string; foodId: string; foodName: string }
  | { kind: "log_food"; mealId: string; foodName: string }
  | { kind: "add_water"; ml: number; newTotalLitres: number };

export interface AIResponse {
  text: string;
  /** When a write action is proposed, the confirmation card data. */
  action?: {
    type: ActionType;
    label: string;
    description: string;
    proposal: ProposedAction;
  };
  /** Any structured data the UI might render (search results, etc). */
  data?: unknown;
}

export interface AIContext {
  /** The full user message (handlers receive only the matched fragment). */
  message?: string;
  profile: UserProfile;
  processed: ProcessedProfile | null;
  plan: DietPlan | null;
  attachments: AttachmentRecord[];
  hasAnyData: boolean;
  /** Conversation memory for follow-ups. */
  memory: AssistantMemory;
}

export interface AssistantMemory {
  /** Last search results, so "the second one" can refer to them. */
  lastFoodSearch: FoodItemRecord[] | null;
  /** Last meal the user asked about, for "why this meal?" follow-ups. */
  lastMealLabel: string | null;
  /** What the user was last doing, for contextual follow-ups. */
  lastIntent: string | null;
}

export function emptyMemory(): AssistantMemory {
  return { lastFoodSearch: null, lastMealLabel: null, lastIntent: null };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function listFoods(foods: FoodItemRecord[], limit = 5): string {
  return foods
    .slice(0, limit)
    .map(
      (f) =>
        `${f.name} (${f.calories} kcal, ${f.proteinGrams}g protein)`,
    )
    .join("; ");
}

function planSummary(plan: DietPlan): string {
  const meals = plan.meals
    .map((m) => `${m.label} at ${formatTime(m.time)}: ${m.name}`)
    .join(" • ");
  return `Today's plan — ${meals}. Total: ${plan.dailyTotals.calories.toLocaleString()} kcal, ${Math.round(
    plan.dailyTotals.protein,
  )}g protein, ${Math.round(plan.dailyTotals.carbohydrates)}g carbs, ${Math.round(
    plan.dailyTotals.fat,
  )}g fat.`;
}

function macroLine(processed: ProcessedProfile): string {
  const e = processed.energy;
  const m = processed.macronutrients;
  const parts: string[] = [];
  if (e.selectedCalories) parts.push(`${e.selectedCalories.toLocaleString()} kcal`);
  if (m.protein.selectedGrams) parts.push(`${Math.round(m.protein.selectedGrams)}g protein`);
  if (m.carbohydrates.grams) parts.push(`${Math.round(m.carbohydrates.grams)}g carbs`);
  if (m.fat.grams) parts.push(`${Math.round(m.fat.grams)}g fat`);
  return parts.join(", ");
}

/* ------------------------------------------------------------------ */
/* Intent definitions                                                  */
/* ------------------------------------------------------------------ */

interface IntentHandler {
  id: string;
  patterns: RegExp[];
  type: ActionType;
  handle: (match: RegExpMatchArray, ctx: AIContext) => AIResponse | null;
}

const intents: IntentHandler[] = [
  /* -------------------- profile -------------------- */
  {
    id: "profile_bmi",
    type: "read",
    patterns: [/what'?s? my bmi/i, /bmi/i, /body mass/i],
    handle: (_m, ctx) => {
      if (!ctx.processed?.bmi)
        return { text: "Your BMI hasn't been calculated yet. Complete your profile and calculate nutrition first." };
      const b = ctx.processed.bmi;
      return {
        text: `Your BMI is ${b.value} — this is in the ${b.categoryLabel.toLowerCase()}. BMI is a general screening measure and does not provide a complete assessment of health.`,
      };
    },
  },
  {
    id: "profile_weight",
    type: "read",
    patterns: [/my weight/i, /how much do i weigh/i, /what.*weight/i],
    handle: (_m, ctx) => {
      const w = ctx.profile.personalDetails.weightKg;
      if (w === null) return { text: "I don't know your weight yet — add it in your personal details." };
      return { text: `You weigh ${w} kg.` };
    },
  },
  {
    id: "profile_goal",
    type: "read",
    patterns: [/my goal/i, /what.*goal/i, /what am i (?:trying|aiming)/i],
    handle: (_m, ctx) => {
      const goal = ctx.processed?.goal;
      if (!goal) return { text: "You haven't set a goal yet. Choose one in Nutrition & Preferences." };
      return { text: `Your goal is ${goal.label.toLowerCase()}. This shapes your calorie and protein targets.` };
    },
  },
  {
    id: "profile_activity",
    type: "read",
    patterns: [/my activity/i, /how active/i, /activity level/i],
    handle: (_m, ctx) => {
      const a = ctx.profile.personalDetails.activityLevel;
      if (!a) return { text: "Your activity level isn't set yet." };
      const label = labelFor([{ id: a, label: "" }], a) ?? a;
      return { text: `Your activity level is ${label.toLowerCase()}.` };
    },
  },

  /* -------------------- nutrition -------------------- */
  {
    id: "nutrition_calories",
    type: "read",
    patterns: [/(?:my|daily)\s+(?:calorie|kcal|energy)/i, /how many calories/i, /calorie target/i, /energy target/i],
    handle: (_m, ctx) => {
      if (!ctx.processed) return { text: "Nutrition targets aren't calculated yet." };
      const e = ctx.processed.energy;
      if (e.selectedCalories === null) return { text: "No calorie target available." };
      const source = e.selectedSource === "user" ? "the target you provided" : "an estimate from your profile";
      return {
        text: `Your daily energy target is ${e.selectedCalories.toLocaleString()} kcal, based on ${source}. Your maintenance estimate is ${e.maintenanceEstimateCalories?.toLocaleString() ?? "—"} kcal.`,
      };
    },
  },
  {
    id: "nutrition_protein",
    type: "read",
    patterns: [/(?:my|daily)\s+protein/i, /how much protein/i, /protein target/i],
    handle: (_m, ctx) => {
      const p = ctx.processed?.macronutrients.protein;
      if (!p?.selectedGrams) return { text: "Protein target isn't available yet." };
      return { text: `Your protein target is ${Math.round(p.selectedGrams)} g per day.` };
    },
  },
  {
    id: "nutrition_macros",
    type: "read",
    patterns: [/macro/i, /nutrient/i, /carb.*fat/i, /what should i eat/i],
    handle: (_m, ctx) => {
      if (!ctx.processed) return { text: "Calculate your nutrition targets first." };
      return { text: `Your daily targets: ${macroLine(ctx.processed)}.` };
    },
  },

  /* -------------------- food search -------------------- */
  {
    id: "food_search",
    type: "read",
    patterns: [/find\s+(?:me\s+)?(?:a\s+)?(?:high[- ]protein|vegetarian|vegan|healthy|quick|breakfast|lunch|dinner|snack)/i,
      /what can i eat/i, /suggest.*(?:food|meal|snack)/i, /high[- ]protein/i, /vegetarian (?:food|meal|dish)/i],
    handle: (match, ctx) => {
      const q = match[0].toLowerCase();
      let candidates = [...FOOD_DATABASE];

      // Apply filters from the query
      if (/vegetarian/i.test(q) || (ctx.profile.dietaryPreferences.dietaryType && ctx.profile.dietaryPreferences.dietaryType === "vegetarian"))
        candidates = candidates.filter((f) => f.dietaryTypes.includes("vegetarian"));
      if (/vegan/i.test(q) || (ctx.profile.dietaryPreferences.dietaryType && ctx.profile.dietaryPreferences.dietaryType === "vegan"))
        candidates = candidates.filter((f) => f.dietaryTypes.includes("vegan"));
      if (/high[- ]protein/i.test(q))
        candidates = candidates.sort((a, b) => b.proteinGrams - a.proteinGrams);
      if (/quick|fast|easy/i.test(q))
        candidates = candidates.sort((a, b) => a.preparationTimeMinutes - b.preparationTimeMinutes);
      if (/breakfast/i.test(q))
        candidates = candidates.filter((f) => f.category === "breakfast");
      if (/lunch/i.test(q))
        candidates = candidates.filter((f) => f.category === "lunch");
      if (/dinner/i.test(q))
        candidates = candidates.filter((f) => f.category === "dinner");
      if (/snack/i.test(q))
        candidates = candidates.filter((f) => f.category === "morning_snack" || f.category === "evening_snack");

      // Apply user allergies
      const allergies = ctx.profile.allergies.filter((a) => a !== "none");
      if (allergies.length > 0)
        candidates = candidates.filter((f) => !allergies.some((a) => f.allergens.includes(a)));

      // Apply foods to avoid
      if (ctx.profile.foodsToAvoid.length > 0)
        candidates = candidates.filter((f) =>
          !ctx.profile.foodsToAvoid.some((avoid) =>
            f.name.toLowerCase().includes(avoid) || f.ingredients.some((i) => i.includes(avoid)),
          ),
        );

      if (candidates.length === 0)
        return { text: "I couldn't find any foods matching that with your current restrictions." };

      const top = candidates.slice(0, 8);
      ctx.memory.lastFoodSearch = top;
      ctx.memory.lastIntent = "food_search";

      return {
        text: `Here are some options: ${listFoods(top)}. You can say "the second one" or "tell me more about [name]" to continue.`,
        data: { foods: top },
      };
    },
  },
  {
    id: "food_details",
    type: "read",
    patterns: [/(?:the\s+)?(?:first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th)\s+one/i, /tell me (?:more )?about\s+(.+)/i, /more about\s+(.+)/i, /details (?:of|for|about)\s+(.+)/i],
    handle: (match, ctx) => {
      // "the second one" — refer back to the last search results
      const ordinal = match[0].match(/(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th)\s+one/i);
      if (ordinal) {
        if (!ctx.memory.lastFoodSearch) {
          return { text: "I don't have a recent list to refer to — try a food search first." };
        }
        const map: Record<string, number> = { first: 0, "1st": 0, second: 1, "2nd": 1, third: 2, "3rd": 2, fourth: 3, "4th": 3, fifth: 4, "5th": 4 };
        const idx = map[ordinal[1].toLowerCase()];
        const f = ctx.memory.lastFoodSearch[idx];
        if (!f) return { text: "That number is beyond the list I showed you." };
        return { text: formatFoodDetails(f) };
      }
      const name = (match[1] ?? "").trim().replace(/[?.!]+$/, "");
      if (!name) return { text: "Which food would you like to know more about?" };
      const found = FOOD_DATABASE.find(
        (f) => f.name.toLowerCase().includes(name.toLowerCase()),
      );
      if (!found) return { text: `I couldn't find "${name}" in the food database.` };
      return { text: formatFoodDetails(found) };
    },
  },

  /* -------------------- meal replacement -------------------- */
  {
    id: "meal_replace",
    type: "write",
    patterns: [/replace\s+(?:my\s+)?(?:dinner|lunch|breakfast|snack|meal)/i,
      /swap\s+(?:my\s+)?(?:dinner|lunch|breakfast|snack)/i,
      /change\s+(?:my\s+)?(?:dinner|lunch|breakfast|snack)/i,
      /(?:something|what)\s+(?:else|different)\s+(?:for|to)\s+(?:eat\s+)?(?:dinner|lunch|breakfast|snack)/i],
    handle: (match, ctx) => {
      if (!ctx.plan) return { text: "You need a generated diet plan before replacing a meal." };

      // Find which meal
      const text = match[0].toLowerCase();
      let mealLabel = "dinner";
      if (/breakfast/i.test(text)) mealLabel = "breakfast";
      else if (/lunch/i.test(text)) mealLabel = "lunch";
      else if (/snack/i.test(text)) mealLabel = "eveningSnack";

      // Find alternative from the database
      const alternatives = FOOD_DATABASE.filter((f) => {
        const diet = ctx.profile.dietaryPreferences.dietaryType;
        if (diet && !f.dietaryTypes.includes(diet)) return false;
        const allergies = ctx.profile.allergies.filter((a) => a !== "none");
        if (allergies.some((a) => f.allergens.includes(a))) return false;
        if (ctx.profile.foodsToAvoid.some((avoid) =>
          f.name.toLowerCase().includes(avoid) || f.ingredients.some((i) => i.includes(avoid)),
        )) return false;
        return true;
      }).sort((a, b) => b.proteinGrams - a.proteinGrams);

      // Pick an alternative that isn't the current meal (compare by slot id)
      const currentMeal = ctx.plan.meals.find((m) => m.type === mealLabel);
      if (!currentMeal)
        return { text: `Your current plan doesn't include a ${mealLabel.replace(/([A-Z])/g, " $1").toLowerCase()} to replace.` };
      const currentFoods = new Set(currentMeal?.items.map((i) => i.foodId) ?? []);
      const options = alternatives.filter((f) => !currentFoods.has(f.id));

      if (options.length === 0)
        return { text: `I couldn't find a safe alternative for ${mealLabel}.` };

      const pick = options[Math.floor(Math.random() * Math.min(5, options.length))];
      ctx.memory.lastMealLabel = mealLabel;
      ctx.memory.lastIntent = "meal_replace";

      return {
        text: `I found ${pick.name} (${pick.calories} kcal, ${Math.round(pick.proteinGrams)}g protein) that fits your ${mealLabel}. It respects your dietary pattern and restrictions. Want me to replace it?`,
        action: {
          type: "write",
          label: `Replace ${mealLabel.replace(/([A-Z])/g, " $1").toLowerCase()}`,
          description: `Your ${mealLabel.replace(/([A-Z])/g, " $1").toLowerCase()} will be replaced with ${pick.name}.`,
          proposal: { kind: "replace_meal", slot: mealLabel, foodId: pick.id, foodName: pick.name },
        },
        data: { replacement: pick, mealLabel },
      };
    },
  },

  /* -------------------- diet explanation -------------------- */
  {
    id: "explain_diet",
    type: "read",
    patterns: [/explain my (?:diet|plan|meal)/i, /why this (?:meal|food|plan)/i, /how.*personal/i, /why.*selected/i, /why.*recommend/i],
    handle: (match, ctx) => {
      if (!ctx.plan) return { text: "Generate your diet plan first, then I can explain it." };

      if (/why/i.test(match[0])) {
        const slotFromText = (ctx.message ?? "").match(/breakfast|lunch|dinner|morning\s*snack|evening\s*snack/i)?.[0]
          ?.toLowerCase().replace(/\s+/g, "");
        const wanted = slotFromText
          ? slotFromText.replace("morningsnack", "morningSnack").replace("eveningsnack", "eveningSnack")
          : ctx.memory.lastMealLabel ?? "dinner";
        const meal = ctx.plan.meals.find((m) => m.type === wanted) ?? ctx.plan.meals[0];
        if (!meal) return { text: "I couldn't find that meal in your current plan." };
        const food = meal.items[0] ? FOOD_BY_ID.get(meal.items[0].foodId) : null;
        if (!food) return { text: "I couldn't find details for that food." };

        const reasons: string[] = [];
        const diet = ctx.profile.dietaryPreferences.dietaryType;
        if (diet && food.dietaryTypes.includes(diet))
          reasons.push(`it fits your ${ctx.profile.dietaryPreferences.dietaryType} diet`);
        if (food.proteinGrams >= 10) reasons.push(`it provides ${Math.round(food.proteinGrams)}g of protein`);
        if (food.preparationTimeMinutes <= 15) reasons.push(`it's quick to prepare (${food.preparationTimeMinutes} min)`);
        if (food.tags.some((t) => ["high_protein", "high_fiber"].includes(t)))
          reasons.push("it's nutrient-dense");
        if (ctx.profile.dietaryPreferences.preferredCuisines.some((c) => food.cuisines.includes(c)))
          reasons.push(`it matches your preferred cuisine`);

        return {
          text: `${food.name} was chosen because ${reasons.join("; ")}; and it passes all your allergy and restriction checks. It contributes ${meal.calories} kcal to your day.`,
        };
      }

      return { text: planSummary(ctx.plan) };
    },
  },

  /* -------------------- shopping list -------------------- */
  {
    id: "shopping",
    type: "read",
    patterns: [/shopping list/i, /grocery/i, /what.*buy/i, /ingredients/i],
    handle: (_m, ctx) => {
      if (!ctx.plan) return { text: "Generate a diet plan first, then I can create a shopping list from it." };

      // Aggregate ingredients
      const ingredients = new Map<string, number>();
      for (const meal of ctx.plan.meals) {
        for (const item of meal.items) {
          const food = FOOD_BY_ID.get(item.foodId);
          if (!food) continue;
          for (const ing of food.ingredients) {
            const key = ing.toLowerCase().trim();
            ingredients.set(key, (ingredients.get(key) ?? 0) + 1);
          }
        }
      }

      // Group into shopping categories so the answer is complete in itself.
      const groups: Record<string, string[]> = { Produce: [], Protein: [], Grains: [], Dairy: [], Pantry: [] };
      const classify = (name: string): keyof typeof groups => {
        if (/dal|chickpea|kidney bean|rajma|chole|tofu|soy|paneer|egg|chicken|fish|sprout|chana|peanut|almond|walnut|nuts?|seeds?/.test(name)) return "Protein";
        if (/rice|wheat|flour|oats|millet|quinoa|semolina|bread|idli|dosa|poha|flattened rice|roti|chapati|pasta|noodle/.test(name)) return "Grains";
        if (/curd|milk|yogurt|cheese|butter|ghee|cream|buttermilk/.test(name)) return "Dairy";
        if (/oil|salt|spice|masala|turmeric|cumin|mustard|coriander|jaggery|honey|sauce|lemon|tamarind|curry leaves|cinnamon|pepper/.test(name)) return "Pantry";
        return "Produce";
      };
      for (const [name] of ingredients) groups[classify(name)].push(name);
      const lines = Object.entries(groups)
        .filter(([, items]) => items.length > 0)
        .map(([group, items]) => `${group}: ${items.join(", ")}`)
        .join("\n");
      return {
        text: `Shopping list for today's plan:\n${lines}`,
        data: { groups },
      };
    },
  },

  /* -------------------- food logging -------------------- */
  {
    id: "log_food",
    type: "write",
    patterns: [
      /\b(?:log|record|track|add|ate|had|eat)\s+(?:some\s+|a\s+|an\s+|two\s+|\d+\s+)?(.+?)\s+(?:for|to|at|as)\s+(?:my\s+)?(breakfast|lunch|dinner|morning\s*snack|evening\s*snack|snack)\b/i,
      /\b(?:log|record|track)\s+(?:some\s+|a\s+|an\s+)?([a-z][a-z\s]{1,40}?)\s*$/i,
    ],
    handle: (match, ctx) => {
      const foodName = (match[1] ?? "").trim().replace(/\s+/g, " ");
      if (/\b(?:ml|litre|liter|glass|water)\b/i.test(foodName)) return null; // let hydration handle it
      let mealId = "otherSnacks";
      if (match[2]) {
        const m = match[2].toLowerCase();
        if (/breakfast/.test(m)) mealId = "breakfast";
        else if (/lunch/.test(m)) mealId = "lunch";
        else if (/dinner/.test(m)) mealId = "dinner";
        else if (/morning/.test(m)) mealId = "morningSnack";
        else if (/evening|snack/.test(m)) mealId = "eveningSnack";
      }

      if (!foodName) return { text: "What food would you like to log?" };

      // Match by whole word in the name first (so "banana" → Banana, not
      // a dish that merely contains the letters), then by ingredient.
      const needle = foodName.toLowerCase();
      const wordRe = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      const found =
        FOOD_DATABASE.find((f) => f.name.toLowerCase() === needle) ??
        FOOD_DATABASE.find((f) => wordRe.test(f.name)) ??
        FOOD_DATABASE.find((f) => f.ingredients.some((i) => wordRe.test(i)));

      if (!found)
        return {
          text: `I couldn't find "${foodName}" in the food database. I can only log foods that are in the database — try searching first with "find high-protein foods".`,
        };

      const mealLabel = mealId.replace(/([A-Z])/g, " $1").toLowerCase();
      return {
        text: `I found ${found.name} (${found.calories} kcal, ${Math.round(found.proteinGrams)}g protein). Add it to your ${mealLabel}?`,
        action: {
          type: "write",
          label: `Add ${found.name} to ${mealLabel}`,
          description: `${found.name} will be added to your ${mealLabel} in your food intake.`,
          proposal: { kind: "log_food", mealId, foodName: found.name },
        },
        data: { food: found, mealId },
      };
    },
  },

  /* -------------------- hydration -------------------- */
  {
    id: "hydration",
    type: "write",
    patterns: [/\bwater\b/i, /hydrat/i, /\d+(?:\.\d+)?\s*(?:ml|millilit|litres?|liters?|glass(?:es)?|cups?)\b/i],
    handle: (match, ctx) => {
      const text = ctx.message ?? match[0];
      const mlMatch = text.match(/(\d+(?:\.\d+)?)\s*(ml|millilit\w*|litres?|liters?|glass(?:es)?|cups?)\b/i);
      if (!mlMatch) {
        const current = ctx.profile.waterIntake.litresPerDay;
        return {
          text: current !== null
            ? `Your current water intake is ${current} L today. You can say "add 250 ml" or "add 1 glass".`
            : `You haven't logged any water today. Say "add 250 ml" to start tracking.`,
        };
      }
      const amount = parseFloat(mlMatch[1]);
      const unit = mlMatch[2].toLowerCase();
      let ml = amount;
      if (/litre|liter/i.test(unit)) ml = amount * 1000;
      else if (/millilit/i.test(unit)) ml = amount;
      else if (/glass|cup/i.test(unit)) ml = amount * 250;

      if (ml < 1 || ml > 5000) return { text: "Please enter a reasonable amount (1–5000 ml)." };

      const current = ctx.profile.waterIntake.litresPerDay ?? 0;
      const newTotal = Math.round((current + ml / 1000) * 100) / 100;
      return {
        text: `Adding ${ml} ml brings your daily water intake to ${newTotal} L. Confirm?`,
        action: {
          type: "write",
          label: `Add ${ml} ml water`,
          description: `Your daily water intake will be updated to ${newTotal} L.`,
          proposal: { kind: "add_water", ml, newTotalLitres: newTotal },
        },
        data: { ml, newTotal },
      };
    },
  },

  /* -------------------- attachment -------------------- */
  {
    id: "attachment",
    type: "read",
    patterns: [/(?:my|the)\s+(?:upload|document|attachment|file)/i, /what.*(?:upload|document|attachment)/i, /analy[sz]e.*(?:upload|document|file)/i],
    handle: (_m, ctx) => {
      const docs = ctx.attachments.filter((a) => a.extraction !== null);
      if (docs.length === 0)
        return { text: "You haven't uploaded any documents yet. Go to Documents & Attachments to add one." };

      const latest = docs[docs.length - 1];
      const fields = latest.extraction?.fields ?? [];
      if (fields.length === 0)
        return { text: `Your latest document (${latest.displayName}) was processed, but no structured information was found. It's kept as reference.` };

      const summary = fields.slice(0, 5).map((f) => `${f.key}: ${f.rawValue}`).join("; ");
      return {
        text: `From ${latest.displayName}: ${summary}. You can review and import these values from the Attachments page.`,
      };
    },
  },

  /* -------------------- general -------------------- */
  {
    id: "general_help",
    type: "read",
    patterns: [/help/i, /what can you do/i, /how.*work/i, /commands/i, /options/i],
    handle: () => ({
      text: "I can help you with:\n• Nutrition questions — ask about your BMI, calories, protein, or macros\n• Food search — \"find high-protein vegetarian foods\"\n• Meal replacement — \"replace my dinner with something lighter\"\n• Diet explanation — \"explain my diet\" or \"why this meal\"\n• Shopping list — \"create my shopping list\"\n• Food logging — \"log banana for breakfast\"\n• Hydration — \"add 250 ml water\"\n• Documents — \"what did my upload say\"\nJust ask in plain language!",
    }),
  },
];

/* ------------------------------------------------------------------ */
/* Food details formatter                                              */
/* ------------------------------------------------------------------ */

function formatFoodDetails(f: FoodItemRecord): string {
  return `${f.name} — ${f.calories} kcal per serving, ${Math.round(f.proteinGrams)}g protein, ${Math.round(f.carbohydrateGrams)}g carbs, ${Math.round(fatGrams(f))}g fat. Preparation: ${f.preparationTimeMinutes} minutes. Dietary types: ${f.dietaryTypes.join(", ")}. Tags: ${f.tags.join(", ")}.`;
}

function fatGrams(f: FoodItemRecord): number {
  return f.calories > 0
    ? Math.max(0, (f.calories - f.proteinGrams * 4 - f.carbohydrateGrams * 4) / 9)
    : 0;
}

/* ------------------------------------------------------------------ */
/* Main entry point                                                    */
/* ------------------------------------------------------------------ */

/** Specific intents must win over broad keyword intents. */
const INTENT_PRIORITY = [
  "general_help",
  "hydration",
  "log_food",
  "meal_replace",
  "food_details",
  "food_search",
  "shopping",
  "attachment",
  "explain_diet",
  "profile_bmi",
  "profile_goal",
  "profile_weight",
  "profile_activity",
  "nutrition_calories",
  "nutrition_protein",
  "nutrition_macros",
];
const orderedIntents = [...intents].sort(
  (a, b) => INTENT_PRIORITY.indexOf(a.id) - INTENT_PRIORITY.indexOf(b.id),
);

export function processMessage(message: string, ctx: AIContext): AIResponse {
  const trimmed = message.trim();
  if (!trimmed) return { text: "Please ask me something!" };

  ctx.message = trimmed;

  // Try each intent in priority order (first match wins)
  for (const intent of orderedIntents) {
    for (const pattern of intent.patterns) {
      const match = trimmed.match(pattern);
      if (match) {
        const result = intent.handle(match, ctx);
        if (result) return result;
        break; // pattern matched but handler returned null — try next intent
      }
    }
  }

  // No intent matched — try food name lookup as a fallback
  const foodGuess = FOOD_DATABASE.find((f) =>
    trimmed.toLowerCase().includes(f.name.toLowerCase()),
  );
  if (foodGuess) return { text: formatFoodDetails(foodGuess) };

  // Greeting
  if (/^(hi|hello|hey|good\s*(morning|afternoon|evening))\b/i.test(trimmed)) {
    const name = ctx.profile.personalDetails.fullName.trim().split(" ")[0];
    return {
      text: `Hi${name ? `, ${name}` : ""}! I'm your Personal Nutrition Assistant. Ask me about your diet, nutrition targets, or any food. Type "help" to see what I can do.`,
    };
  }

  // Fallback
  return {
    text: "I'm not sure how to help with that yet. Try asking about your nutrition, searching for foods, or type \"help\" to see what I can do.",
  };
}
