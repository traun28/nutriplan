/**
 * Part 7 — the restriction filter stage.
 *
 * SAFETY RULE (also enforced independently by planValidator.ts):
 *   ALLERGY > INTOLERANCE > DIETARY PATTERN > FOOD TO AVOID > PREFERENCE
 *
 * Nothing in the scoring stage can reintroduce a food removed here: the
 * generator only ever sees the filtered pool. Every rejection carries a
 * reason so the engine can explain why options ran out.
 */
import type {
  DietaryType,
  FoodItemRecord,
  UserProfile,
} from "@/types/profile";
import { normalizeFood } from "@/lib/normalize";

export type RejectionReason =
  | "allergy"
  | "intolerance"
  | "dietary_type"
  | "food_to_avoid";

export interface FoodRejection {
  foodId: string;
  reason: RejectionReason;
  detail: string;
}

export interface FilterOutcome {
  allowed: FoodItemRecord[];
  rejections: FoodRejection[];
}

/** Words that identify an allergen inside a free-text ingredient list. */
const ALLERGEN_INGREDIENT_TOKENS: Record<string, string[]> = {
  milk_dairy: ["milk", "curd", "paneer", "cheese", "butter", "ghee", "cream", "yogurt", "buttermilk"],
  eggs: ["egg", "eggs"],
  peanuts: ["peanut", "peanuts", "peanut butter", "groundnut"],
  tree_nuts: ["almond", "almonds", "cashew", "cashews", "walnut", "walnuts", "pistachio"],
  soy: ["soy", "soya", "tofu", "soy sauce", "soy milk", "soy chunks"],
  wheat: ["wheat", "wheat flour", "bread", "semolina", "roti", "chapati"],
  gluten: ["wheat", "wheat flour", "bread", "semolina", "barley", "roti", "chapati"],
  fish: ["fish"],
  shellfish: ["prawn", "prawns", "shrimp", "crab", "lobster"],
  sesame: ["sesame", "sesame oil", "tahini"],
};

const INTOLERANCE_INGREDIENT_TOKENS: Record<string, string[]> = {
  lactose: ["milk", "curd", "paneer", "cheese", "butter", "cream", "yogurt", "buttermilk", "ghee"],
  dairy: ["milk", "curd", "paneer", "cheese", "butter", "cream", "yogurt", "buttermilk", "ghee"],
  gluten: ["wheat", "wheat flour", "bread", "semolina", "barley", "roti", "chapati"],
  soy: ["soy", "soya", "tofu", "soy sauce", "soy milk", "soy chunks"],
};

/**
 * Word-boundary aware containment test.
 * "rice" must not match "liquorice", but "soy sauce" must match "soy".
 */
function containsToken(haystack: string, token: string): boolean {
  if (haystack === token) return true;
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`, "i").test(haystack);
}

/** True when any ingredient (or the food name) matches one of the tokens. */
function matchesAnyToken(food: FoodItemRecord, tokens: string[]): boolean {
  const haystacks = [
    normalizeFood(food.name),
    ...food.ingredients.map(normalizeFood),
  ];
  return tokens.some((token) => {
    const needle = normalizeFood(token);
    return haystacks.some((hay) => containsToken(hay, needle));
  });
}

/* ------------------------------------------------------------------ */
/* Individual checks                                                   */
/* ------------------------------------------------------------------ */

/**
 * Allergy check — the strictest rule.
 * Uses BOTH the declared allergen metadata and an indirect ingredient
 * scan, so a "Banana Peanut Butter Smoothie" is caught by a peanut
 * allergy even though "peanut" is not the leading word in the title.
 */
export function violatesAllergy(
  food: FoodItemRecord,
  allergies: string[],
): string | null {
  for (const allergy of allergies) {
    if (allergy === "none") continue;

    // Free-text "other:<text>" allergies are matched against ingredients.
    if (allergy.startsWith("other:")) {
      const custom = normalizeFood(allergy.slice(6));
      if (custom && matchesAnyToken(food, [custom])) {
        return `contains ${custom}`;
      }
      continue;
    }

    if (food.allergens.includes(allergy)) return allergy;

    const tokens = ALLERGEN_INGREDIENT_TOKENS[allergy];
    if (tokens && matchesAnyToken(food, tokens)) return allergy;
  }
  return null;
}

export function violatesIntolerance(
  food: FoodItemRecord,
  intolerances: string[],
): string | null {
  for (const intolerance of intolerances) {
    if (intolerance.startsWith("other:")) {
      const custom = normalizeFood(intolerance.slice(6));
      if (custom && matchesAnyToken(food, [custom])) return `${custom}`;
      continue;
    }

    if (food.intoleranceFlags.includes(intolerance)) return intolerance;

    const tokens = INTOLERANCE_INGREDIENT_TOKENS[intolerance];
    if (tokens && matchesAnyToken(food, tokens)) return intolerance;
  }
  return null;
}

export function violatesDietaryType(
  food: FoodItemRecord,
  dietaryType: DietaryType | "",
): boolean {
  if (!dietaryType) return false;
  return !food.dietaryTypes.includes(dietaryType);
}

/**
 * Foods-to-avoid check.
 * Matching is conservative: the entry must appear as a whole word in the
 * food name or an ingredient, so "mushroom" rejects "Mushroom Masala"
 * without accidentally rejecting unrelated dishes.
 */
export function violatesFoodsToAvoid(
  food: FoodItemRecord,
  foodsToAvoid: string[],
): string | null {
  for (const entry of foodsToAvoid) {
    const needle = normalizeFood(entry);
    if (!needle) continue;
    if (matchesAnyToken(food, [needle])) return needle;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Pipeline                                                            */
/* ------------------------------------------------------------------ */

/**
 * Applies every restriction in priority order and returns both the
 * surviving pool and a full rejection log.
 */
export function filterFoods(
  database: FoodItemRecord[],
  profile: UserProfile,
): FilterOutcome {
  const allowed: FoodItemRecord[] = [];
  const rejections: FoodRejection[] = [];

  const allergies = profile.allergies.filter((entry) => entry !== "none");
  const { intolerances, foodsToAvoid } = profile;
  const dietaryType = profile.dietaryPreferences.dietaryType;

  for (const food of database) {
    // 1. Dietary pattern.
    if (violatesDietaryType(food, dietaryType)) {
      rejections.push({
        foodId: food.id,
        reason: "dietary_type",
        detail: `not suitable for a ${dietaryType.replace(/_/g, "-")} pattern`,
      });
      continue;
    }

    // 2. Allergies (highest safety priority).
    const allergen = violatesAllergy(food, allergies);
    if (allergen) {
      rejections.push({
        foodId: food.id,
        reason: "allergy",
        detail: `contains declared allergen: ${allergen}`,
      });
      continue;
    }

    // 3. Intolerances.
    const intolerance = violatesIntolerance(food, intolerances);
    if (intolerance) {
      rejections.push({
        foodId: food.id,
        reason: "intolerance",
        detail: `conflicts with declared intolerance: ${intolerance}`,
      });
      continue;
    }

    // 4. Explicit foods to avoid.
    const avoided = violatesFoodsToAvoid(food, foodsToAvoid);
    if (avoided) {
      rejections.push({
        foodId: food.id,
        reason: "food_to_avoid",
        detail: `contains a food you asked to avoid: ${avoided}`,
      });
      continue;
    }

    allowed.push(food);
  }

  return { allowed, rejections };
}

/** Foods valid for a given slot, including their secondary categories. */
export function foodsForCategory(
  foods: FoodItemRecord[],
  category: string,
): FoodItemRecord[] {
  return foods.filter(
    (food) =>
      food.category === category ||
      (food.alsoSuitableFor ?? []).includes(category as FoodItemRecord["category"]),
  );
}
