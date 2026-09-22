/**
 * Phase 4 — recipe details layered over the food database.
 *
 * The food database (`src/data/foods/foodDatabase.ts`) stays the single
 * source for names, nutrition, allergens, tags and preparation time. This
 * file adds, for dishes where it has been authored, the practical cooking
 * information a grocery list needs: ingredient quantities for ONE serving
 * of the food's `servingSize`, ordered steps and an approximate cooking
 * time. Dishes not listed here have no quantities or steps, and the UI
 * says so instead of inventing them.
 *
 * Quantities are ordinary household amounts for a single portion; they are
 * shopping guidance, not nutrition inputs — nutrition always comes from the
 * food record.
 */
import type { GroceryUnit } from "@/services/grocery/units";

export interface RecipeIngredient {
  /** Normalised lowercase name, matching the food record's `ingredients`. */
  name: string;
  quantity: number;
  unit: GroceryUnit;
  /** Optional preparation note, e.g. "finely chopped". */
  note?: string;
}

export interface RecipeDetail {
  description: string;
  /** Per one `servingSize` of the food record. */
  ingredients: RecipeIngredient[];
  steps: string[];
  /** Approximate active cooking time in minutes (excludes prep). */
  cookMinutes: number;
}

export const RECIPE_DETAILS: Record<string, RecipeDetail> = {
  bf_vegetable_upma: {
    description: "Roasted semolina cooked with tempered mustard seeds and mixed vegetables — a quick South Indian breakfast.",
    ingredients: [
      { name: "semolina", quantity: 60, unit: "g" },
      { name: "vegetables", quantity: 100, unit: "g", note: "onion, carrot, peas, beans" },
      { name: "mustard seeds", quantity: 0.5, unit: "tsp" },
      { name: "oil", quantity: 2, unit: "tsp" },
      { name: "salt", quantity: 0.5, unit: "tsp" },
    ],
    steps: [
      "Dry-roast the semolina on low heat until it smells nutty, then set aside.",
      "Heat the oil, pop the mustard seeds and soften the vegetables.",
      "Add the vegetables with a splash of water and cook until just tender.",
      "Pour in 180 ml hot water, add salt, then stir in the semolina.",
      "Cover for 2–3 minutes on low heat until the water is absorbed; fluff and serve.",
    ],
    cookMinutes: 10,
  },
  bf_vegetable_poha: {
    description: "Flattened rice tossed with onion, peas and turmeric.",
    ingredients: [
      { name: "flattened rice", quantity: 60, unit: "g" },
      { name: "onion", quantity: 0.5, unit: "piece" },
      { name: "peas", quantity: 40, unit: "g" },
      { name: "turmeric", quantity: 0.25, unit: "tsp" },
      { name: "oil", quantity: 2, unit: "tsp" },
      { name: "salt", quantity: 0.5, unit: "tsp" },
    ],
    steps: [
      "Rinse the flattened rice briefly in a sieve and leave to soften.",
      "Heat the oil, sauté the onion until translucent, then add the peas.",
      "Stir in turmeric and salt, then fold in the softened rice.",
      "Cook covered for 2 minutes on low heat and serve warm.",
    ],
    cookMinutes: 8,
  },
  bf_oats_curd_bowl: {
    description: "No-cook bowl of oats soaked in curd with banana and a little honey.",
    ingredients: [
      { name: "oats", quantity: 50, unit: "g" },
      { name: "curd", quantity: 150, unit: "g" },
      { name: "banana", quantity: 1, unit: "piece" },
      { name: "honey", quantity: 1, unit: "tsp" },
    ],
    steps: [
      "Mix the oats into the curd and rest for 10 minutes (or overnight in the fridge).",
      "Slice the banana over the top and drizzle with honey.",
    ],
    cookMinutes: 0,
  },
  bf_oats_soy_bowl: {
    description: "Warm oats porridge simmered in soy milk with banana and cinnamon.",
    ingredients: [
      { name: "oats", quantity: 50, unit: "g" },
      { name: "soy milk", quantity: 200, unit: "ml" },
      { name: "banana", quantity: 1, unit: "piece" },
      { name: "cinnamon", quantity: 0.25, unit: "tsp" },
    ],
    steps: [
      "Simmer the oats in the soy milk for 4–5 minutes, stirring.",
      "Top with sliced banana and a pinch of cinnamon.",
    ],
    cookMinutes: 5,
  },
  bf_besan_chilla: {
    description: "Savoury gram-flour pancakes with onion, tomato and coriander.",
    ingredients: [
      { name: "gram flour", quantity: 60, unit: "g" },
      { name: "onion", quantity: 0.5, unit: "piece", note: "finely chopped" },
      { name: "tomato", quantity: 0.5, unit: "piece", note: "finely chopped" },
      { name: "coriander", quantity: 1, unit: "tbsp", note: "chopped" },
      { name: "oil", quantity: 2, unit: "tsp" },
      { name: "salt", quantity: 0.5, unit: "tsp" },
    ],
    steps: [
      "Whisk the gram flour with about 90 ml water and salt into a smooth batter.",
      "Stir in the onion, tomato and coriander.",
      "Spread a ladle of batter on a hot oiled pan; cook 2 minutes per side.",
      "Repeat for the second chilla and serve with mint chutney.",
    ],
    cookMinutes: 10,
  },
  bf_moong_sprout_salad: {
    description: "Fresh sprouted moong tossed with onion, tomato, lemon and coriander.",
    ingredients: [
      { name: "moong sprouts", quantity: 120, unit: "g" },
      { name: "onion", quantity: 0.5, unit: "piece" },
      { name: "tomato", quantity: 1, unit: "piece" },
      { name: "lemon", quantity: 0.5, unit: "piece" },
      { name: "coriander", quantity: 1, unit: "tbsp" },
      { name: "salt", quantity: 0.25, unit: "tsp" },
    ],
    steps: [
      "Rinse the sprouts (steam 3 minutes if you prefer them softer).",
      "Chop the onion and tomato and combine with the sprouts.",
      "Squeeze over the lemon, season with salt and finish with coriander.",
    ],
    cookMinutes: 0,
  },
  bf_egg_bhurji_toast: {
    description: "Indian-style scrambled eggs with onion and tomato on toasted bread.",
    ingredients: [
      { name: "eggs", quantity: 2, unit: "piece" },
      { name: "onion", quantity: 0.5, unit: "piece" },
      { name: "tomato", quantity: 0.5, unit: "piece" },
      { name: "bread", quantity: 2, unit: "slice" },
      { name: "oil", quantity: 2, unit: "tsp" },
      { name: "salt", quantity: 0.25, unit: "tsp" },
    ],
    steps: [
      "Soften the onion in oil, add the tomato and cook until jammy.",
      "Pour in the beaten eggs with salt and scramble gently until just set.",
      "Toast the bread and serve the bhurji on top.",
    ],
    cookMinutes: 8,
  },
  bf_boiled_eggs_fruit: {
    description: "Two boiled eggs with a fresh apple.",
    ingredients: [
      { name: "eggs", quantity: 2, unit: "piece" },
      { name: "apple", quantity: 1, unit: "piece" },
    ],
    steps: ["Boil the eggs for 8–9 minutes, cool in water and peel.", "Serve with the sliced apple."],
    cookMinutes: 10,
  },
  ms_mixed_fruit_bowl: {
    description: "Seasonal chopped fruit.",
    ingredients: [
      { name: "apple", quantity: 0.5, unit: "piece" },
      { name: "papaya", quantity: 80, unit: "g" },
      { name: "banana", quantity: 0.5, unit: "piece" },
      { name: "orange", quantity: 0.5, unit: "piece" },
    ],
    steps: ["Chop all fruit into bite-sized pieces and combine."],
    cookMinutes: 0,
  },
  ms_banana: {
    description: "One medium banana.",
    ingredients: [{ name: "banana", quantity: 1, unit: "piece" }],
    steps: ["Peel and eat."],
    cookMinutes: 0,
  },
  ms_roasted_chana: {
    description: "Crunchy roasted chickpeas.",
    ingredients: [{ name: "chickpeas", quantity: 40, unit: "g", note: "roasted" }],
    steps: ["Serve straight from the pack, or warm briefly in a dry pan."],
    cookMinutes: 0,
  },
  ms_curd_bowl: {
    description: "A bowl of plain curd.",
    ingredients: [{ name: "curd", quantity: 150, unit: "g" }],
    steps: ["Serve chilled."],
    cookMinutes: 0,
  },
  ln_dal_rice_sabzi: {
    description: "Toor dal with steamed rice and a simple mixed-vegetable sabzi.",
    ingredients: [
      { name: "toor dal", quantity: 50, unit: "g" },
      { name: "rice", quantity: 75, unit: "g", note: "uncooked" },
      { name: "mixed vegetables", quantity: 120, unit: "g" },
      { name: "turmeric", quantity: 0.5, unit: "tsp" },
      { name: "oil", quantity: 2, unit: "tsp" },
      { name: "salt", quantity: 0.75, unit: "tsp" },
    ],
    steps: [
      "Pressure-cook the dal with turmeric and 300 ml water until soft; season with salt.",
      "Cook the rice in plenty of water until tender, then drain.",
      "Sauté the vegetables in oil with a pinch of turmeric and salt until just cooked.",
      "Serve the dal over the rice with the sabzi alongside.",
    ],
    cookMinutes: 25,
  },
  ln_rajma_chawal: {
    description: "Kidney beans simmered in an onion–tomato gravy, served over rice.",
    ingredients: [
      { name: "kidney beans", quantity: 60, unit: "g", note: "dry weight, soaked overnight" },
      { name: "rice", quantity: 75, unit: "g", note: "uncooked" },
      { name: "onion", quantity: 1, unit: "piece" },
      { name: "tomato", quantity: 2, unit: "piece" },
      { name: "spices", quantity: 1, unit: "tsp", note: "cumin, coriander, garam masala" },
      { name: "oil", quantity: 1, unit: "tbsp" },
      { name: "salt", quantity: 0.75, unit: "tsp" },
    ],
    steps: [
      "Pressure-cook the soaked beans until tender (about 20 minutes).",
      "Fry the onion in oil until golden, add the tomatoes and spices and cook to a thick masala.",
      "Add the beans with their liquid and simmer 10 minutes; season.",
      "Serve over freshly cooked rice.",
    ],
    cookMinutes: 35,
  },
  ln_chole_roti: {
    description: "Spiced chickpea curry with whole-wheat rotis.",
    ingredients: [
      { name: "chickpeas", quantity: 60, unit: "g", note: "dry weight, soaked overnight" },
      { name: "wheat flour", quantity: 80, unit: "g" },
      { name: "onion", quantity: 1, unit: "piece" },
      { name: "tomato", quantity: 2, unit: "piece" },
      { name: "spices", quantity: 1, unit: "tsp", note: "chana masala" },
      { name: "oil", quantity: 1, unit: "tbsp" },
      { name: "salt", quantity: 0.75, unit: "tsp" },
    ],
    steps: [
      "Pressure-cook the soaked chickpeas until soft.",
      "Knead the flour with water into a soft dough; rest 10 minutes.",
      "Cook the onion, tomato and spices in oil to a thick masala, add chickpeas and simmer.",
      "Roll and cook the rotis on a hot tawa; serve with the chole.",
    ],
    cookMinutes: 35,
  },
  ln_paneer_curry_roti: {
    description: "Paneer in a creamy tomato–onion gravy with rotis.",
    ingredients: [
      { name: "paneer", quantity: 100, unit: "g" },
      { name: "wheat flour", quantity: 80, unit: "g" },
      { name: "tomato", quantity: 2, unit: "piece" },
      { name: "onion", quantity: 1, unit: "piece" },
      { name: "cream", quantity: 1, unit: "tbsp" },
      { name: "spices", quantity: 1, unit: "tsp" },
      { name: "salt", quantity: 0.75, unit: "tsp" },
    ],
    steps: [
      "Blend the sautéed onion and tomato into a smooth gravy and cook with the spices.",
      "Add the paneer cubes and cream; simmer 5 minutes and season.",
      "Serve with freshly made rotis.",
    ],
    cookMinutes: 25,
  },
  ln_curd_rice_salad: {
    description: "Cooling curd rice with a cucumber–carrot salad.",
    ingredients: [
      { name: "rice", quantity: 75, unit: "g", note: "uncooked" },
      { name: "curd", quantity: 150, unit: "g" },
      { name: "cucumber", quantity: 0.5, unit: "piece" },
      { name: "carrot", quantity: 1, unit: "piece" },
      { name: "mustard seeds", quantity: 0.5, unit: "tsp" },
      { name: "salt", quantity: 0.5, unit: "tsp" },
    ],
    steps: [
      "Cook the rice until soft, cool slightly and mash lightly with the curd and salt.",
      "Temper the mustard seeds in a teaspoon of oil and pour over.",
      "Serve with the chopped cucumber and grated carrot.",
    ],
    cookMinutes: 20,
  },
  ln_chicken_curry_rice: {
    description: "Home-style chicken curry with steamed rice.",
    ingredients: [
      { name: "chicken", quantity: 150, unit: "g" },
      { name: "rice", quantity: 75, unit: "g", note: "uncooked" },
      { name: "onion", quantity: 1, unit: "piece" },
      { name: "tomato", quantity: 1, unit: "piece" },
      { name: "spices", quantity: 1.5, unit: "tsp" },
      { name: "oil", quantity: 1, unit: "tbsp" },
      { name: "salt", quantity: 0.75, unit: "tsp" },
    ],
    steps: [
      "Brown the onion in oil, add the tomato and spices and cook until the oil separates.",
      "Add the chicken pieces, coat well, add 150 ml water and simmer 20 minutes.",
      "Serve with steamed rice.",
    ],
    cookMinutes: 30,
  },
  ln_egg_curry_rice: {
    description: "Boiled eggs in a spiced onion–tomato gravy with rice.",
    ingredients: [
      { name: "eggs", quantity: 2, unit: "piece" },
      { name: "rice", quantity: 75, unit: "g", note: "uncooked" },
      { name: "onion", quantity: 1, unit: "piece" },
      { name: "tomato", quantity: 1, unit: "piece" },
      { name: "spices", quantity: 1, unit: "tsp" },
      { name: "oil", quantity: 1, unit: "tbsp" },
      { name: "salt", quantity: 0.75, unit: "tsp" },
    ],
    steps: [
      "Boil and peel the eggs.",
      "Cook the onion, tomato and spices in oil to a gravy; add the eggs and simmer 5 minutes.",
      "Serve with rice.",
    ],
    cookMinutes: 25,
  },
  ln_quinoa_chickpea_bowl: {
    description: "Warm quinoa with chickpeas, wilted spinach, olive oil and lemon.",
    ingredients: [
      { name: "quinoa", quantity: 60, unit: "g" },
      { name: "chickpeas", quantity: 100, unit: "g", note: "cooked" },
      { name: "spinach", quantity: 60, unit: "g" },
      { name: "olive oil", quantity: 2, unit: "tsp" },
      { name: "lemon", quantity: 0.5, unit: "piece" },
      { name: "salt", quantity: 0.5, unit: "tsp" },
    ],
    steps: [
      "Rinse and simmer the quinoa in 150 ml water for 15 minutes.",
      "Wilt the spinach in a little olive oil, add the chickpeas to warm through.",
      "Combine with the quinoa, dress with lemon and olive oil, season.",
    ],
    cookMinutes: 18,
  },
  ln_quick_dal_rice_bowl: {
    description: "Fast one-pot moong dal and rice with turmeric and cumin.",
    ingredients: [
      { name: "moong dal", quantity: 50, unit: "g" },
      { name: "rice", quantity: 60, unit: "g", note: "uncooked" },
      { name: "turmeric", quantity: 0.5, unit: "tsp" },
      { name: "cumin", quantity: 0.5, unit: "tsp" },
      { name: "oil", quantity: 2, unit: "tsp" },
      { name: "salt", quantity: 0.75, unit: "tsp" },
    ],
    steps: [
      "Rinse the dal and rice together; pressure-cook with turmeric, salt and 400 ml water for 2 whistles.",
      "Temper cumin in oil and pour over before serving.",
    ],
    cookMinutes: 12,
  },
  ln_chickpea_salad_wrap: {
    description: "Chickpea salad bowl with cucumber, tomato, onion, olive oil and lemon.",
    ingredients: [
      { name: "chickpeas", quantity: 150, unit: "g", note: "cooked" },
      { name: "cucumber", quantity: 0.5, unit: "piece" },
      { name: "tomato", quantity: 1, unit: "piece" },
      { name: "onion", quantity: 0.5, unit: "piece" },
      { name: "olive oil", quantity: 2, unit: "tsp" },
      { name: "lemon", quantity: 0.5, unit: "piece" },
      { name: "salt", quantity: 0.5, unit: "tsp" },
    ],
    steps: ["Chop the vegetables and toss with the chickpeas.", "Dress with olive oil, lemon and salt."],
    cookMinutes: 0,
  },
  es_sprouts_chaat: {
    description: "Tangy sprouts chaat with onion, tomato and chaat masala.",
    ingredients: [
      { name: "moong sprouts", quantity: 100, unit: "g" },
      { name: "onion", quantity: 0.5, unit: "piece" },
      { name: "tomato", quantity: 0.5, unit: "piece" },
      { name: "lemon", quantity: 0.5, unit: "piece" },
      { name: "chaat masala", quantity: 0.5, unit: "tsp" },
    ],
    steps: ["Combine the sprouts with the chopped onion and tomato.", "Add lemon juice and chaat masala; toss."],
    cookMinutes: 0,
  },
  es_masala_corn: {
    description: "Steamed sweet corn with lemon and chaat masala.",
    ingredients: [
      { name: "sweet corn", quantity: 120, unit: "g" },
      { name: "lemon", quantity: 0.5, unit: "piece" },
      { name: "chaat masala", quantity: 0.5, unit: "tsp" },
    ],
    steps: ["Steam or microwave the corn for 4–5 minutes.", "Toss with lemon juice and chaat masala."],
    cookMinutes: 5,
  },
  es_vegetable_soup: {
    description: "Light clear soup with carrot, beans and cabbage.",
    ingredients: [
      { name: "carrot", quantity: 1, unit: "piece" },
      { name: "beans", quantity: 40, unit: "g" },
      { name: "cabbage", quantity: 60, unit: "g" },
      { name: "pepper", quantity: 0.25, unit: "tsp" },
      { name: "salt", quantity: 0.5, unit: "tsp" },
    ],
    steps: ["Simmer the chopped vegetables in 300 ml water for 10 minutes.", "Season with salt and pepper."],
    cookMinutes: 12,
  },
  dn_roti_dal_sabzi: {
    description: "Whole-wheat rotis with moong dal and a vegetable sabzi.",
    ingredients: [
      { name: "wheat flour", quantity: 80, unit: "g" },
      { name: "moong dal", quantity: 50, unit: "g" },
      { name: "mixed vegetables", quantity: 120, unit: "g" },
      { name: "oil", quantity: 2, unit: "tsp" },
      { name: "salt", quantity: 0.75, unit: "tsp" },
    ],
    steps: [
      "Cook the dal with water and a little salt until soft.",
      "Sauté the vegetables in oil until tender; season.",
      "Knead, roll and cook the rotis; serve together.",
    ],
    cookMinutes: 30,
  },
  dn_khichdi_curd: {
    description: "Comforting moong dal khichdi finished with ghee, served with curd.",
    ingredients: [
      { name: "rice", quantity: 50, unit: "g" },
      { name: "moong dal", quantity: 40, unit: "g" },
      { name: "curd", quantity: 100, unit: "g" },
      { name: "ghee", quantity: 1, unit: "tsp" },
      { name: "turmeric", quantity: 0.25, unit: "tsp" },
      { name: "salt", quantity: 0.5, unit: "tsp" },
    ],
    steps: [
      "Pressure-cook the rinsed rice and dal with turmeric, salt and 350 ml water until soft.",
      "Stir in the ghee and serve with curd.",
    ],
    cookMinutes: 15,
  },
  dn_vegetable_khichdi: {
    description: "Rice and moong dal cooked with carrot and peas.",
    ingredients: [
      { name: "rice", quantity: 50, unit: "g" },
      { name: "moong dal", quantity: 40, unit: "g" },
      { name: "carrot", quantity: 1, unit: "piece" },
      { name: "peas", quantity: 40, unit: "g" },
      { name: "oil", quantity: 2, unit: "tsp" },
      { name: "turmeric", quantity: 0.25, unit: "tsp" },
      { name: "salt", quantity: 0.5, unit: "tsp" },
    ],
    steps: [
      "Sauté the diced carrot and peas briefly in oil.",
      "Add the rinsed rice, dal, turmeric, salt and 350 ml water; pressure-cook until soft.",
    ],
    cookMinutes: 15,
  },
  dn_paneer_bhurji_roti: {
    description: "Crumbled paneer with onion and capsicum, served with rotis.",
    ingredients: [
      { name: "paneer", quantity: 100, unit: "g" },
      { name: "wheat flour", quantity: 80, unit: "g" },
      { name: "onion", quantity: 0.5, unit: "piece" },
      { name: "capsicum", quantity: 0.5, unit: "piece" },
      { name: "oil", quantity: 2, unit: "tsp" },
      { name: "salt", quantity: 0.5, unit: "tsp" },
    ],
    steps: [
      "Sauté the onion and capsicum in oil until soft.",
      "Add the crumbled paneer and salt; cook 3 minutes.",
      "Serve with freshly made rotis.",
    ],
    cookMinutes: 15,
  },
  dn_tofu_stirfry_rice: {
    description: "Tofu stir-fried with capsicum and broccoli in sesame oil, over rice.",
    ingredients: [
      { name: "tofu", quantity: 120, unit: "g" },
      { name: "rice", quantity: 60, unit: "g", note: "uncooked" },
      { name: "capsicum", quantity: 0.5, unit: "piece" },
      { name: "broccoli", quantity: 80, unit: "g" },
      { name: "sesame oil", quantity: 2, unit: "tsp" },
      { name: "salt", quantity: 0.5, unit: "tsp" },
    ],
    steps: [
      "Cook the rice.",
      "Sear the tofu cubes in sesame oil, add the vegetables and stir-fry 4 minutes.",
      "Season and serve over the rice.",
    ],
    cookMinutes: 15,
  },
  dn_grilled_fish_vegetables: {
    description: "Grilled fish fillet with broccoli and carrot, olive oil and lemon.",
    ingredients: [
      { name: "fish", quantity: 150, unit: "g" },
      { name: "broccoli", quantity: 80, unit: "g" },
      { name: "carrot", quantity: 1, unit: "piece" },
      { name: "olive oil", quantity: 2, unit: "tsp" },
      { name: "lemon", quantity: 0.5, unit: "piece" },
      { name: "salt", quantity: 0.5, unit: "tsp" },
    ],
    steps: [
      "Season the fish with salt and lemon; grill 4–5 minutes per side.",
      "Steam or sauté the vegetables in olive oil.",
    ],
    cookMinutes: 15,
  },
  dn_egg_fried_rice: {
    description: "Egg fried rice with carrot, beans and soy sauce.",
    ingredients: [
      { name: "eggs", quantity: 2, unit: "piece" },
      { name: "rice", quantity: 60, unit: "g", note: "uncooked, cooked and cooled" },
      { name: "carrot", quantity: 1, unit: "piece" },
      { name: "beans", quantity: 40, unit: "g" },
      { name: "soy sauce", quantity: 2, unit: "tsp" },
      { name: "oil", quantity: 2, unit: "tsp" },
    ],
    steps: [
      "Scramble the eggs in a little oil and set aside.",
      "Stir-fry the diced vegetables, add the cooled rice and soy sauce, then fold the eggs back in.",
    ],
    cookMinutes: 12,
  },
  dn_rajma_salad_bowl: {
    description: "Kidney bean salad with cucumber, tomato, olive oil and lemon.",
    ingredients: [
      { name: "kidney beans", quantity: 150, unit: "g", note: "cooked" },
      { name: "cucumber", quantity: 0.5, unit: "piece" },
      { name: "tomato", quantity: 1, unit: "piece" },
      { name: "olive oil", quantity: 2, unit: "tsp" },
      { name: "lemon", quantity: 0.5, unit: "piece" },
      { name: "salt", quantity: 0.5, unit: "tsp" },
    ],
    steps: ["Combine the beans with the chopped vegetables.", "Dress with olive oil, lemon and salt."],
    cookMinutes: 0,
  },
  dn_millet_upma_dinner: {
    description: "Millet cooked upma-style with carrot, beans and curry leaves.",
    ingredients: [
      { name: "millet", quantity: 60, unit: "g" },
      { name: "carrot", quantity: 1, unit: "piece" },
      { name: "beans", quantity: 40, unit: "g" },
      { name: "curry leaves", quantity: 6, unit: "piece" },
      { name: "oil", quantity: 2, unit: "tsp" },
      { name: "salt", quantity: 0.5, unit: "tsp" },
    ],
    steps: [
      "Rinse the millet. Temper curry leaves in oil, add the diced vegetables and sauté.",
      "Add the millet, salt and 180 ml water; cover and cook 12 minutes until fluffy.",
    ],
    cookMinutes: 15,
  },
  dn_moong_chaat_bowl: {
    description: "Warm moong sprouts with carrot, tomato, lemon and cumin.",
    ingredients: [
      { name: "moong sprouts", quantity: 120, unit: "g" },
      { name: "carrot", quantity: 1, unit: "piece" },
      { name: "tomato", quantity: 1, unit: "piece" },
      { name: "lemon", quantity: 0.5, unit: "piece" },
      { name: "cumin", quantity: 0.5, unit: "tsp" },
      { name: "salt", quantity: 0.5, unit: "tsp" },
    ],
    steps: [
      "Steam the sprouts for 3–4 minutes.",
      "Toss warm with grated carrot, chopped tomato, cumin, lemon and salt.",
    ],
    cookMinutes: 5,
  },
};
