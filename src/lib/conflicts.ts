/**
 * Deterministic conflict detection for Part 3.
 *
 * Safety rule (for Parts 7+ to enforce):
 *   ALLERGY > INTOLERANCE > DIETARY PATTERN > FOOD TO AVOID > PREFERENCE
 *
 * This module only DETECTS simple, obvious conflicts and proposes a
 * resolution; it never silently deletes user input. The UI lets the user
 * resolve each conflict with one click, and the Continue action stays
 * blocked until everything is resolved.
 *
 * This is intentionally a simple rule table, not a medical system.
 */
import type { UserProfile } from "@/types/profile";
import { normalizeFood } from "@/lib/normalize";

export interface ConflictResolution {
  field: "preferredFoods" | "foodsToAvoid";
  value: string;
  action: "remove";
  /** What the resolve button should say. */
  label: string;
}

export interface ProfileConflict {
  id: string;
  kind:
    | "allergy_preference"
    | "intolerance_preference"
    | "diet_preference"
    | "avoid_preference";
  message: string;
  resolution: ConflictResolution;
}

/* Foods associated with each predefined allergen (normalised forms). */
const ALLERGEN_FOODS: Record<string, string[]> = {
  milk_dairy: ["milk", "paneer", "curd", "dahi", "cheese", "butter", "ghee", "yogurt", "yoghurt"],
  eggs: ["egg", "eggs"],
  peanuts: ["peanut", "peanuts"],
  tree_nuts: ["almond", "almonds", "cashew", "cashews", "walnut", "walnuts", "pistachio", "nuts"],
  soy: ["soy", "soya", "tofu"],
  wheat: ["wheat", "roti", "chapati", "bread"],
  gluten: ["wheat", "roti", "chapati", "bread", "pasta", "noodles"],
  fish: ["fish"],
  shellfish: ["shellfish", "prawn", "prawns", "shrimp", "crab", "lobster"],
  sesame: ["sesame", "tahini"],
};

/** Foods incompatible with each dietary pattern (normalised forms). */
const DIET_FORBIDDEN: Record<string, string[]> = {
  vegan: [
    "chicken", "fish", "meat", "mutton", "beef", "pork", "egg", "eggs",
    "milk", "paneer", "curd", "dahi", "cheese", "butter", "ghee", "honey", "yogurt",
  ],
  vegetarian: ["chicken", "fish", "meat", "mutton", "beef", "pork", "egg", "eggs"],
  eggetarian: ["chicken", "fish", "meat", "mutton", "beef", "pork"],
  pescatarian: ["chicken", "meat", "mutton", "beef", "pork"],
};

const INTOLERANCE_FOODS: Record<string, string[]> = {
  lactose: ["milk", "paneer", "curd", "dahi", "cheese", "butter", "ghee", "yogurt"],
  dairy: ["milk", "paneer", "curd", "dahi", "cheese", "butter", "ghee", "yogurt"],
  gluten: ["wheat", "roti", "chapati", "bread", "pasta", "noodles"],
  soy: ["soy", "soya", "tofu"],
};

function matches(food: string, tokens: string[]): boolean {
  return tokens.some(
    (token) => food === token || food.includes(token),
  );
}

function removeFrom(
  field: "preferredFoods" | "foodsToAvoid",
  value: string,
): ConflictResolution {
  const display = value
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return {
    field,
    value,
    action: "remove",
    label: `Remove “${display}” from ${field === "preferredFoods" ? "preferred foods" : "foods to avoid"}`,
  };
}

/**
 * Part 9 — advisory conflict summary for the Review and Diet Plan pages.
 *
 * Unlike `detectConflicts` (which blocks the questionnaire until the user
 * resolves a contradiction), this NEVER changes the saved profile. It just
 * explains, in plain language, how the safety rules will be applied — the
 * user's own data is left exactly as they entered it.
 */
export function describeConflicts(profile: UserProfile): string[] {
  const notes: string[] = [];

  // Contradiction: "no known allergies" ticked alongside specific allergens.
  const specificAllergies = profile.allergies.filter(
    (entry) => entry !== "none",
  );
  if (profile.allergies.includes("none") && specificAllergies.length > 0) {
    notes.push(
      "Your profile says you have no known food allergies but also lists specific allergens. The specific allergens are treated as exclusions, because restrictions always take priority.",
    );
  }

  for (const conflict of detectConflicts(profile)) {
    const food = conflict.resolution.value;
    if (conflict.kind === "allergy_preference") {
      notes.push(
        `“${food}” appears in your preferred foods but relates to a declared allergy. Because allergies take priority, it will be excluded from your plan. Your saved preference has not been changed.`,
      );
    } else if (conflict.kind === "intolerance_preference") {
      notes.push(
        `“${food}” appears in your preferred foods but relates to a declared intolerance, so it will be excluded from your plan.`,
      );
    } else if (conflict.kind === "diet_preference") {
      notes.push(
        `“${food}” does not match your selected dietary pattern, so it will not be used in your plan.`,
      );
    } else {
      notes.push(
        `“${food}” is listed both as a preferred food and as a food to avoid. The avoid list takes priority.`,
      );
    }
  }

  return notes;
}

export function detectConflicts(profile: UserProfile): ProfileConflict[] {
  const conflicts: ProfileConflict[] = [];
  const seen = new Set<string>();

  const push = (
    key: string,
    kind: ProfileConflict["kind"],
    message: string,
    resolution: ConflictResolution,
  ) => {
    if (seen.has(key)) return;
    seen.add(key);
    conflicts.push({ id: key, kind, message, resolution });
  };

  const { dietaryType } = profile.dietaryPreferences;
  const hasNoAllergies = profile.allergies.includes("none");

  for (const raw of profile.preferredFoods) {
    const food = normalizeFood(raw);
    if (!food) continue;

    // 1. Allergy vs preference — highest priority, always blocking.
    if (!hasNoAllergies) {
      for (const allergy of profile.allergies) {
        if (allergy === "none" || allergy.startsWith("other:")) continue;
        const tokens = ALLERGEN_FOODS[allergy];
        if (tokens && matches(food, tokens)) {
          push(
            `allergy:${allergy}:${food}`,
            "allergy_preference",
            `“${food}” is in your preferred foods, but you declared a related allergy. Allergies always take priority over food preferences.`,
            removeFrom("preferredFoods", food),
          );
        }
      }
    }

    // 2. Intolerance vs preference.
    for (const intolerance of profile.intolerances) {
      if (intolerance.startsWith("other:")) continue;
      const tokens = INTOLERANCE_FOODS[intolerance];
      if (tokens && matches(food, tokens)) {
        push(
          `intolerance:${intolerance}:${food}`,
          "intolerance_preference",
          `“${food}” may not suit your declared ${intolerance} intolerance.`,
          removeFrom("preferredFoods", food),
        );
      }
    }

    // 3. Dietary pattern vs preference.
    const forbidden = dietaryType ? DIET_FORBIDDEN[dietaryType] : undefined;
    if (forbidden && matches(food, forbidden)) {
      push(
        `diet:${dietaryType}:${food}`,
        "diet_preference",
        `“${food}” doesn’t match your ${dietaryType.replace(/_/g, "-")} dietary pattern.`,
        removeFrom("preferredFoods", food),
      );
    }

    // 4. Same food in both preferred and avoid lists.
    if (profile.foodsToAvoid.includes(food)) {
      push(
        `avoid:${food}`,
        "avoid_preference",
        `“${food}” is listed both as a preferred food and as a food to avoid.`,
        removeFrom("preferredFoods", food),
      );
    }
  }

  return conflicts;
}
