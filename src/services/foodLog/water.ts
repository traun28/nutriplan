/**
 * Phase 2 — water helpers. The default target is a common planning
 * figure, adjustable per user; it is not a medical requirement.
 */
export const DEFAULT_WATER_TARGET_ML = 2500;
export const WATER_QUICK_ADD_ML = [150, 250, 500] as const;

export function formatLitres(ml: number): string {
  const litres = ml / 1000;
  return `${(Math.round(litres * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })} L`;
}
