/**
 * Part 11 — similarity lookup and the OPTIONAL dataset ranking signal.
 *
 * This is an auxiliary signal only. Per requirements 43–46 and 54–55:
 *
 *   • It never copies a participant's meals into the user's plan.
 *   • It never overrides allergies, intolerances, dietary pattern,
 *     foods-to-avoid, goals or calculated targets.
 *   • It makes no clinical or causal claim — the dataset records what
 *     participants reported eating, not what worked for them.
 *
 * Ranking order used by the generator remains:
 *   Safety > Diet compatibility > Nutritional fit > Goal fit >
 *   Practical fit > User preference > Dataset signal > Variety
 */
import type { UserProfile } from "../../types/profile.ts";
import type { DatasetParticipant } from "./schema.ts";
import { cleanText } from "./normalizer.ts";
import { isHighConfidence } from "./validator.ts";

export interface SimilarParticipant {
  participant: DatasetParticipant;
  /** 0..1 — higher means closer to the current user. */
  score: number;
  /** Which attributes matched, for explainability. */
  matchedOn: string[];
}

/** Half-widths of the acceptable neighbourhoods. */
const AGE_WINDOW = 5;
const BMI_WINDOW = 3;

function bmiOf(record: DatasetParticipant): number | null {
  if (!record.heightCm || !record.weightKg || record.heightCm <= 0) return null;
  const metres = record.heightCm / 100;
  return record.weightKg / (metres * metres);
}

function userBmi(profile: UserProfile): number | null {
  const { heightCm, weightKg } = profile.personalDetails;
  if (!heightCm || !weightKg || heightCm <= 0) return null;
  const metres = heightCm / 100;
  return weightKg / (metres * metres);
}

/**
 * Finds dataset participants resembling the current user across age, BMI,
 * activity level and reported food preferences.
 *
 * Only high-confidence records are considered, so a badly parsed row cannot
 * influence the signal.
 */
export function findSimilarParticipants(
  profile: UserProfile,
  records: DatasetParticipant[],
  limit = 10,
): SimilarParticipant[] {
  const usable = records.filter(isHighConfidence);
  if (usable.length === 0) return [];

  const targetAge = profile.personalDetails.age;
  const targetBmi = userBmi(profile);
  const targetActivity = profile.personalDetails.activityLevel || null;
  const wantedFoods = [
    ...profile.preferredFoods,
    ...Object.values(profile.foodIntake).flatMap((meal) =>
      meal.items.map((item) => cleanText(item.name).toLowerCase()),
    ),
  ].filter((food) => food.length > 0);

  const scored: SimilarParticipant[] = [];

  for (const participant of usable) {
    let score = 0;
    let possible = 0;
    const matchedOn: string[] = [];

    if (targetAge !== null && participant.age !== null) {
      possible += 1;
      const gap = Math.abs(participant.age - targetAge);
      if (gap <= AGE_WINDOW) {
        score += 1 - gap / (AGE_WINDOW + 1);
        matchedOn.push(`Age within ${AGE_WINDOW} years`);
      }
    }

    const participantBmi = bmiOf(participant);
    if (targetBmi !== null && participantBmi !== null) {
      possible += 1;
      const gap = Math.abs(participantBmi - targetBmi);
      if (gap <= BMI_WINDOW) {
        score += 1 - gap / (BMI_WINDOW + 1);
        matchedOn.push("Similar BMI range");
      }
    }

    if (targetActivity && participant.activityLevel) {
      possible += 1;
      if (participant.activityLevel === targetActivity) {
        score += 1;
        matchedOn.push("Same activity level");
      }
    }

    if (wantedFoods.length > 0) {
      const reported = [
        ...participant.meals.breakfast,
        ...participant.meals.lunch,
        ...participant.meals.dinner,
        ...participant.meals.snacks,
      ].map((food) => cleanText(food).toLowerCase());

      const overlaps = wantedFoods.filter((food) =>
        reported.some((item) => item.includes(food) || food.includes(item)),
      );
      if (overlaps.length > 0) {
        possible += 1;
        score += Math.min(1, overlaps.length / 3);
        matchedOn.push(`Reports eating ${overlaps.slice(0, 3).join(", ")}`);
      }
    }

    if (possible === 0 || score === 0) continue;

    scored.push({
      participant,
      score: score / possible,
      matchedOn,
    });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * The signal consumed by the diet generator.
 *
 * Returns 0..1 per food name. When the dataset is unavailable or no
 * participants are similar, it returns a CONSTANT neutral value — a constant
 * cannot reorder candidates, so generation behaves exactly as it did before
 * this layer existed (requirement 63: dataset failure must not break Part 7).
 */
export interface DatasetSignal {
  available: boolean;
  /** Number of comparable participants found. */
  sampleSize: number;
  /** food name (lowercase) → 0..1 */
  weights: Map<string, number>;
  explain: string[];
}

export const NEUTRAL_SIGNAL: DatasetSignal = {
  available: false,
  sampleSize: 0,
  weights: new Map(),
  explain: [],
};

export function buildDatasetSignal(
  profile: UserProfile,
  records: DatasetParticipant[],
): DatasetSignal {
  const similar = findSimilarParticipants(profile, records, 10);
  if (similar.length === 0) return NEUTRAL_SIGNAL;

  // Count how often each food appears among the similar participants' meals.
  const counts = new Map<string, number>();
  for (const entry of similar) {
    const foods = [
      ...entry.participant.meals.breakfast,
      ...entry.participant.meals.lunch,
      ...entry.participant.meals.dinner,
      ...entry.participant.meals.snacks,
    ];
    for (const food of foods) {
      const key = cleanText(food).toLowerCase();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const max = Math.max(...counts.values(), 1);
  const weights = new Map<string, number>();
  for (const [food, count] of counts) {
    weights.set(food, count / max);
  }

  return {
    available: true,
    sampleSize: similar.length,
    weights,
    explain: [
      `Compared with ${similar.length} dataset participant${
        similar.length === 1 ? "" : "s"
      } of similar age, BMI and activity level.`,
      "Dataset frequency is one ranking signal among several. It never " +
        "overrides your allergies, dietary pattern or targets, and it is not " +
        "evidence that any food is healthier.",
    ],
  };
}

/**
 * Scores one candidate food against the dataset signal (0..1).
 * Returns 0.5 — a constant, ranking-neutral value — when the dataset is
 * unavailable or says nothing about this food.
 */
export function datasetPreferenceSignal(
  signal: DatasetSignal,
  foodName: string,
  ingredients: string[],
): number {
  if (!signal.available || signal.weights.size === 0) return 0.5;

  const haystacks = [cleanText(foodName).toLowerCase(), ...ingredients.map((i) => cleanText(i).toLowerCase())];
  let best = 0;
  for (const [food, weight] of signal.weights) {
    if (haystacks.some((hay) => hay.includes(food) || food.includes(hay))) {
      best = Math.max(best, weight);
    }
  }

  return best === 0 ? 0.5 : best;
}
