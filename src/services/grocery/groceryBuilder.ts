/**
 * Phase 4 — grocery-list generation from a saved 7-day plan.
 *
 *   plan days → planned items → recipe ingredients × servings
 *   → combine by (name, dimension) → subtract compatible pantry stock
 *   → grouped list with traceability ("used in Day 2 Lunch").
 *
 * Rules:
 *   • quantities come only from authored RecipeDetails scaled by the
 *     planned servings; foods without details produce an "unquantified"
 *     entry so the user still sees the ingredient is needed;
 *   • quantities are combined ONLY within one unit dimension (g/kg,
 *     ml/l, tsp/tbsp, pieces). Different dimensions for the same
 *     ingredient stay as separate lines;
 *   • pantry stock is subtracted only when its unit is in the same
 *     dimension; otherwise the full requirement is shown and the pantry
 *     match is reported as "could not be compared".
 */
import type { WeeklyPlanData } from "@/services/diet/weeklyPlanner";
import { RECIPE_DETAILS } from "@/data/recipes/recipeDetails";
import { categoryForIngredient, normaliseIngredientName, type GroceryCategory } from "@/data/recipes/ingredientCatalog";
import { FOOD_BY_ID } from "@/data/foods/foodDatabase";
import { presentQuantity, round, toBase, unitsCompatible, type GroceryUnit } from "@/services/grocery/units";

export interface GrocerySource {
  dayIndex: number;
  dayLabel: string;
  mealLabel: string;
  recipeId: string;
  recipeName: string;
}

export interface GeneratedGroceryItem {
  name: string;
  category: GroceryCategory;
  /** Required amount after pantry subtraction; null when not quantifiable. */
  quantity: number | null;
  unit: GroceryUnit | null;
  /** Amount before pantry subtraction (same unit). */
  requiredQuantity: number | null;
  /** Pantry amount that was subtracted (same unit). */
  pantryQuantity: number | null;
  /** True when the pantry has this item but its unit could not be compared. */
  pantryUncomparable: boolean;
  /** True when at least one source recipe had no authored quantities. */
  partiallyUnquantified: boolean;
  sources: GrocerySource[];
}

export interface PantryStock {
  name: string;
  quantity: number | null;
  unit: GroceryUnit | null;
}

interface Accumulator {
  name: string;
  dimensionUnit: GroceryUnit | null; // base unit; null → unquantified bucket
  quantity: number;
  sources: GrocerySource[];
  unquantified: boolean;
}

function key(name: string, unit: GroceryUnit | null): string {
  return `${name}::${unit ?? "?"}`;
}

export function buildGroceryItems(
  plan: WeeklyPlanData,
  options: { dayIndexes?: number[] | null; pantry?: PantryStock[] } = {},
): { items: GeneratedGroceryItem[]; coveredByPantry: string[] } {
  const wanted = options.dayIndexes && options.dayIndexes.length > 0 ? new Set(options.dayIndexes) : null;
  const acc = new Map<string, Accumulator>();

  for (const day of plan.days) {
    if (wanted && !wanted.has(day.dayIndex)) continue;
    for (const meal of day.plan.meals) {
      for (const item of meal.items) {
        const source: GrocerySource = {
          dayIndex: day.dayIndex,
          dayLabel: day.date ? `${day.label} (${day.weekday})` : day.label,
          mealLabel: meal.label,
          recipeId: item.foodId,
          recipeName: item.name,
        };
        const detail = RECIPE_DETAILS[item.foodId];
        if (detail) {
          for (const ing of detail.ingredients) {
            const name = normaliseIngredientName(ing.name);
            const base = toBase(ing.quantity * item.servings, ing.unit);
            const k = key(name, base.unit);
            const entry = acc.get(k) ?? { name, dimensionUnit: base.unit, quantity: 0, sources: [], unquantified: false };
            entry.quantity += base.quantity;
            entry.sources.push(source);
            acc.set(k, entry);
          }
        } else {
          const food = FOOD_BY_ID.get(item.foodId);
          for (const raw of food?.ingredients ?? []) {
            const name = normaliseIngredientName(raw);
            const k = key(name, null);
            const entry = acc.get(k) ?? { name, dimensionUnit: null, quantity: 0, sources: [], unquantified: true };
            entry.sources.push(source);
            acc.set(k, entry);
          }
        }
      }
    }
  }

  // Pantry stock in base units, keyed by name.
  const stock = new Map<string, { quantity: number; unit: GroceryUnit }[]>();
  const stockNamesNoQty = new Set<string>();
  for (const p of options.pantry ?? []) {
    const name = normaliseIngredientName(p.name);
    if (p.quantity === null || p.unit === null || p.quantity <= 0) {
      stockNamesNoQty.add(name);
      continue;
    }
    const base = toBase(p.quantity, p.unit);
    const list = stock.get(name) ?? [];
    list.push({ quantity: base.quantity, unit: base.unit });
    stock.set(name, list);
  }

  // An ingredient that is quantified by some recipes and unquantified by
  // others becomes ONE line (quantity = the known part, flagged partial).
  const quantifiedNames = new Set(Array.from(acc.values()).filter((e) => e.dimensionUnit !== null).map((e) => e.name));
  const partialNames = new Set<string>();
  for (const [k, entry] of Array.from(acc.entries())) {
    if (entry.dimensionUnit !== null || !quantifiedNames.has(entry.name)) continue;
    const target = Array.from(acc.values()).find((e) => e.name === entry.name && e.dimensionUnit !== null)!;
    target.sources.push(...entry.sources);
    partialNames.add(entry.name);
    acc.delete(k);
  }

  const items: GeneratedGroceryItem[] = [];
  const covered: string[] = [];
  const usedStock = new Map<string, number>(); // name::unit → consumed

  for (const entry of acc.values()) {
    const category = categoryForIngredient(entry.name);
    if (entry.dimensionUnit === null) {
      const inPantry = stock.has(entry.name) || stockNamesNoQty.has(entry.name);
      items.push({
        name: entry.name,
        category,
        quantity: null,
        unit: null,
        requiredQuantity: null,
        pantryQuantity: null,
        pantryUncomparable: inPantry,
        partiallyUnquantified: true,
        sources: dedupeSources(entry.sources),
      });
      continue;
    }

    let remaining = entry.quantity;
    let subtracted = 0;
    let uncomparable = stockNamesNoQty.has(entry.name);
    for (const s of stock.get(entry.name) ?? []) {
      if (!unitsCompatible(s.unit, entry.dimensionUnit)) {
        uncomparable = true;
        continue;
      }
      const usedKey = key(entry.name, s.unit);
      const already = usedStock.get(usedKey) ?? 0;
      const available = Math.max(0, s.quantity - already);
      const take = Math.min(available, remaining);
      remaining -= take;
      subtracted += take;
      usedStock.set(usedKey, already + take);
    }

    const required = presentQuantity(entry.quantity, entry.dimensionUnit);
    const scale = required.quantity === 0 ? 1 : entry.quantity / required.quantity; // base per presented unit
    const toPresented = (baseQty: number) => round(baseQty / scale);

    if (remaining <= 0.0001) {
      covered.push(entry.name);
    }
    items.push({
      name: entry.name,
      category,
      quantity: toPresented(remaining),
      unit: required.unit,
      requiredQuantity: required.quantity,
      pantryQuantity: toPresented(subtracted),
      pantryUncomparable: uncomparable,
      partiallyUnquantified: partialNames.has(entry.name),
      sources: dedupeSources(entry.sources),
    });
  }

  items.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  return { items, coveredByPantry: covered };
}

function dedupeSources(sources: GrocerySource[]): GrocerySource[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    const k = `${s.dayIndex}:${s.mealLabel}:${s.recipeId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
