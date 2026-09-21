/**
 * Part 11 — dataset analytics.
 *
 * Statistics are computed from HIGH-CONFIDENCE records only, so badly parsed
 * or ambiguous rows never distort an average. Everything here is a
 * dataset-level observation: no result is presented as a health conclusion.
 */
import {
  type DatasetParticipant,
  type DatasetStatistics,
  type NutritionStatistics,
  type ParticipantMeals,
  type StatBlock,
} from "./schema.ts";
import { isHighConfidence } from "./validator.ts";
import { cleanText } from "./normalizer.ts";

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function describe(values: number[]): StatBlock | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];

  return {
    count: sorted.length,
    min: round(sorted[0]),
    max: round(sorted[sorted.length - 1]),
    mean: round(sum / sorted.length),
    median: round(median),
  };
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return round(values.reduce((total, value) => total + value, 0) / values.length);
}

function collect(
  records: DatasetParticipant[],
  pick: (record: DatasetParticipant) => number | null,
): number[] {
  const values: number[] = [];
  for (const record of records) {
    const value = pick(record);
    if (value !== null && Number.isFinite(value)) values.push(value);
  }
  return values;
}

function distribution(
  records: DatasetParticipant[],
  pick: (record: DatasetParticipant) => string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const record of records) {
    const key = pick(record) || "Not specified";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

const MEAL_SLOTS: Array<keyof ParticipantMeals> = [
  "breakfast",
  "lunch",
  "dinner",
  "snacks",
];

/**
 * Counts how often each food appears per meal slot.
 * Frequency is a description of the dataset only — it is explicitly NOT a
 * claim that a frequently eaten food is healthier or better.
 */
export function buildFoodFrequency(
  records: DatasetParticipant[],
): DatasetStatistics["foodFrequency"] {
  const result = {
    breakfast: [] as Array<{ food: string; count: number }>,
    lunch: [] as Array<{ food: string; count: number }>,
    dinner: [] as Array<{ food: string; count: number }>,
    snacks: [] as Array<{ food: string; count: number }>,
  };

  for (const slot of MEAL_SLOTS) {
    const counts = new Map<string, number>();
    for (const record of records) {
      for (const item of record.meals[slot]) {
        const food = cleanText(item);
        if (!food) continue;
        const key = food.toLowerCase();
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    result[slot] = Array.from(counts.entries())
      .map(([food, count]) => ({
        food: food.replace(/\b\w/g, (char) => char.toUpperCase()),
        count,
      }))
      .sort((a, b) => b.count - a.count || a.food.localeCompare(b.food))
      .slice(0, 15);
  }

  return result;
}

export function buildNutritionStatistics(
  records: DatasetParticipant[],
): NutritionStatistics {
  return {
    sampleSize: records.length,
    caloriesKcal: describe(collect(records, (r) => r.nutrition.caloriesKcal)),
    proteinG: describe(collect(records, (r) => r.nutrition.proteinG)),
    carbohydratesG: describe(
      collect(records, (r) => r.nutrition.carbohydratesG),
    ),
    fatG: describe(collect(records, (r) => r.nutrition.fatG)),
    dietaryFibreG: describe(
      collect(records, (r) => r.nutrition.dietaryFibreG),
    ),
    sugarG: describe(collect(records, (r) => r.nutrition.sugarG)),
    sodiumMg: describe(collect(records, (r) => r.nutrition.sodiumMg)),
  };
}

/** Full statistics object. Callers should pass high-confidence records. */
export function buildStatistics(
  allRecords: DatasetParticipant[],
): DatasetStatistics {
  const usable = allRecords.filter(isHighConfidence);

  const bmis = collect(usable, (record) => {
    if (!record.heightCm || !record.weightKg || record.heightCm <= 0) return null;
    const metres = record.heightCm / 100;
    return record.weightKg / (metres * metres);
  });

  return {
    participantSampleSize: usable.length,
    nutritionSampleSize: usable.length,
    averageAge: average(collect(usable, (r) => r.age)),
    averageHeightCm: average(collect(usable, (r) => r.heightCm)),
    averageWeightKg: average(collect(usable, (r) => r.weightKg)),
    averageBmi: bmis.length > 0 ? round(bmis.reduce((a, b) => a + b, 0) / bmis.length) : null,
    activityLevelDistribution: distribution(
      usable,
      (r) => r.activityLevelSource || (r.activityLevel ?? ""),
    ),
    genderDistribution: distribution(usable, (r) => r.genderSource),
    nutrition: buildNutritionStatistics(usable),
    foodFrequency: buildFoodFrequency(usable),
  };
}
