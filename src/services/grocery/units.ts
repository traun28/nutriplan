/**
 * Phase 4 — grocery units and the SAFE conversions between them.
 *
 * Only conversions inside the same dimension are performed (g↔kg, ml↔l,
 * tsp↔tbsp). Nothing crosses dimensions (no "cup → grams"), because that
 * depends on the ingredient's density and would fabricate a number.
 */
export type GroceryUnit = "g" | "kg" | "ml" | "l" | "tsp" | "tbsp" | "piece" | "slice" | "bunch" | "pack";

export const GROCERY_UNITS: { id: GroceryUnit; label: string }[] = [
  { id: "g", label: "g" },
  { id: "kg", label: "kg" },
  { id: "ml", label: "ml" },
  { id: "l", label: "litre" },
  { id: "tsp", label: "tsp" },
  { id: "tbsp", label: "tbsp" },
  { id: "piece", label: "piece(s)" },
  { id: "slice", label: "slice(s)" },
  { id: "bunch", label: "bunch(es)" },
  { id: "pack", label: "pack(s)" },
];

type Dimension = "mass" | "volume" | "spoon" | "count" | "slice" | "bunch" | "pack";

const DIMENSION: Record<GroceryUnit, { dimension: Dimension; toBase: number; base: GroceryUnit }> = {
  g: { dimension: "mass", toBase: 1, base: "g" },
  kg: { dimension: "mass", toBase: 1000, base: "g" },
  ml: { dimension: "volume", toBase: 1, base: "ml" },
  l: { dimension: "volume", toBase: 1000, base: "ml" },
  tsp: { dimension: "spoon", toBase: 1, base: "tsp" },
  tbsp: { dimension: "spoon", toBase: 3, base: "tsp" },
  piece: { dimension: "count", toBase: 1, base: "piece" },
  slice: { dimension: "slice", toBase: 1, base: "slice" },
  bunch: { dimension: "bunch", toBase: 1, base: "bunch" },
  pack: { dimension: "pack", toBase: 1, base: "pack" },
};

export function isGroceryUnit(value: unknown): value is GroceryUnit {
  return typeof value === "string" && value in DIMENSION;
}

export function unitsCompatible(a: GroceryUnit, b: GroceryUnit): boolean {
  return DIMENSION[a].dimension === DIMENSION[b].dimension;
}

/** Converts to the dimension's base unit (g, ml, tsp, piece …). */
export function toBase(quantity: number, unit: GroceryUnit): { quantity: number; unit: GroceryUnit } {
  const d = DIMENSION[unit];
  return { quantity: quantity * d.toBase, unit: d.base };
}

/** Presents a base quantity in the friendliest unit (1500 g → 1.5 kg). */
export function presentQuantity(quantity: number, unit: GroceryUnit): { quantity: number; unit: GroceryUnit } {
  const base = toBase(quantity, unit);
  if (base.unit === "g" && base.quantity >= 1000) return { quantity: round(base.quantity / 1000), unit: "kg" };
  if (base.unit === "ml" && base.quantity >= 1000) return { quantity: round(base.quantity / 1000), unit: "l" };
  if (base.unit === "tsp" && base.quantity >= 3 && Number.isInteger(base.quantity / 3)) {
    return { quantity: round(base.quantity / 3), unit: "tbsp" };
  }
  return { quantity: round(base.quantity), unit: base.unit };
}

export function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatQuantity(quantity: number, unit: GroceryUnit): string {
  const label = GROCERY_UNITS.find((u) => u.id === unit)?.label ?? unit;
  const q = Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2).replace(/\.?0+$/, "");
  return `${q} ${label}`;
}
