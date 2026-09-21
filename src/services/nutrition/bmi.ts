/**
 * Part 6 — Body Mass Index.
 *
 *   BMI = weight(kg) / height(m)²
 *
 * Height is stored in centimetres, so height(m) = heightCm / 100.
 * Pure function: same inputs always produce the same output.
 */
import type { BmiCategory, BmiResult } from "@/types/profile";
import { BMI_CATEGORY_LABELS } from "@/data/options";
import { BMI_THRESHOLDS } from "@/services/nutrition/constants";
import { roundTo } from "@/lib/numbers";

/** General adult screening categories — never a medical diagnosis. */
export function classifyBmi(value: number): BmiCategory {
  if (value < BMI_THRESHOLDS.underweight) return "underweight";
  if (value < BMI_THRESHOLDS.overweight) return "normal";
  if (value < BMI_THRESHOLDS.obesity) return "overweight";
  return "obesity";
}

/**
 * Returns null when the inputs cannot produce a meaningful BMI
 * (missing, non-finite, zero or negative values) — never NaN/Infinity.
 */
export function calculateBmi(
  weightKg: number | null,
  heightCm: number | null,
): BmiResult | null {
  if (weightKg === null || heightCm === null) return null;
  if (!Number.isFinite(weightKg) || !Number.isFinite(heightCm)) return null;
  if (weightKg <= 0 || heightCm <= 0) return null;

  const heightMetres = heightCm / 100;
  const raw = weightKg / (heightMetres * heightMetres);
  if (!Number.isFinite(raw)) return null;

  const value = roundTo(raw, 1);
  const category = classifyBmi(value);

  return {
    value,
    category,
    categoryLabel: BMI_CATEGORY_LABELS[category] ?? category,
  };
}
