/**
 * Phase 4 — ingredient catalogue.
 *
 * Maps the normalised ingredient names used by the food database to a
 * grocery category. This is classification only — no quantities, prices
 * or nutrition. Anything not listed falls back to "other".
 */
export type GroceryCategory =
  | "vegetables"
  | "fruits"
  | "grains"
  | "protein"
  | "dairy"
  | "pantry"
  | "spices"
  | "other";

export const GROCERY_CATEGORY_ORDER: { id: GroceryCategory; label: string }[] = [
  { id: "vegetables", label: "Vegetables" },
  { id: "fruits", label: "Fruits" },
  { id: "grains", label: "Grains" },
  { id: "protein", label: "Protein" },
  { id: "dairy", label: "Dairy" },
  { id: "pantry", label: "Pantry" },
  { id: "spices", label: "Spices" },
  { id: "other", label: "Other" },
];

const CATALOG: Record<GroceryCategory, string[]> = {
  vegetables: [
    "vegetables", "mixed vegetables", "onion", "tomato", "potato", "peas", "carrot", "beans",
    "cabbage", "cucumber", "lettuce", "spinach", "capsicum", "broccoli", "drumstick",
    "mushroom", "sweet corn", "coriander", "curry leaves", "lemon", "moong sprouts",
  ],
  fruits: ["banana", "apple", "papaya", "orange"],
  grains: [
    "rice", "flattened rice", "semolina", "wheat", "wheat flour", "bread", "oats", "millet",
    "quinoa", "gram flour",
  ],
  protein: [
    "urad dal", "toor dal", "moong dal", "chickpeas", "kidney beans", "soy chunks", "soya",
    "tofu", "eggs", "chicken", "fish", "peanuts", "almonds", "walnuts", "pumpkin seeds",
    "fox nuts",
  ],
  dairy: ["curd", "milk", "paneer", "ghee", "cream"],
  pantry: [
    "oil", "olive oil", "sesame oil", "honey", "jaggery", "peanut butter", "soy milk",
    "soy sauce", "coconut", "tamarind", "salt",
  ],
  spices: [
    "spices", "turmeric", "cumin", "mustard seeds", "cinnamon", "chaat masala", "pepper",
    "peanut free masala",
  ],
  other: [],
};

const LOOKUP = new Map<string, GroceryCategory>();
for (const [category, names] of Object.entries(CATALOG) as [GroceryCategory, string[]][]) {
  for (const name of names) LOOKUP.set(name, category);
}

export function normaliseIngredientName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function categoryForIngredient(name: string): GroceryCategory {
  return LOOKUP.get(normaliseIngredientName(name)) ?? "other";
}

export function groceryCategoryLabel(id: string): string {
  return GROCERY_CATEGORY_ORDER.find((c) => c.id === id)?.label ?? "Other";
}
