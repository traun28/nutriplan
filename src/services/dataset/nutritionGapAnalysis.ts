import { FOOD_DATABASE } from "@/data/foods/foodDatabase";
import { processUserProfile } from "@/services/nutrition/nutritionProcessor";
import { createEmptyProfile, type UserProfile } from "@/types/profile";
import type { DatasetParticipant } from "@/data/dataset/schema";

export type NutrientKey =
  | "caloriesKcal"
  | "proteinG"
  | "carbohydratesG"
  | "fatG"
  | "dietaryFibreG"
  | "sugarG"
  | "sodiumMg";

export type NutrientStatus =
  | "adequate"
  | "below_target"
  | "above_reference"
  | "significantly_below"
  | "significantly_above"
  | "not_assessable";

export type Severity = "adequate" | "mild" | "moderate" | "significant" | "not_assessable";

export interface NutrientAssessment {
  key: NutrientKey;
  label: string;
  unit: string;
  actual: number | null;
  target: number | null;
  difference: number | null;
  percentageOfTarget: number | null;
  status: NutrientStatus;
  severity: Severity;
  explanation: string;
  recommendations: string[];
}

export interface ParticipantNutritionAnalysis {
  participantId: string;
  name: string;
  age: number | null;
  gender: string;
  heightCm: number | null;
  weightKg: number | null;
  activity: string;
  qualityStatus: string;
  qualityIssues: string[];
  analyzable: boolean;
  summary: string;
  gaps: NutrientAssessment[];
  strengths: NutrientAssessment[];
  nutrients: NutrientAssessment[];
  mealAnalysis: Array<{ meal: string; foods: string[]; notes: string }>;
}

export interface DatasetNutritionAnalysis {
  totalParticipants: number;
  analyzedParticipants: number;
  completeNutritionParticipants: number;
  commonGap: { label: string; count: number; percentage: number } | null;
  averages: Array<{ label: string; unit: string; value: number | null; count: number }>;
  severityDistribution: Array<{ label: string; count: number; percentage: number }>;
  participants: ParticipantNutritionAnalysis[];
  methodology: string[];
}

const NUTRIENTS: Array<{ key: NutrientKey; label: string; unit: string }> = [
  { key: "caloriesKcal", label: "Calories", unit: "kcal" },
  { key: "proteinG", label: "Protein", unit: "g" },
  { key: "carbohydratesG", label: "Carbohydrates", unit: "g" },
  { key: "fatG", label: "Fat", unit: "g" },
  { key: "dietaryFibreG", label: "Dietary fibre", unit: "g" },
  { key: "sugarG", label: "Sugar", unit: "g" },
  { key: "sodiumMg", label: "Sodium", unit: "mg" },
];

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function buildProfile(record: DatasetParticipant): UserProfile | null {
  if (
    record.age === null ||
    record.heightCm === null ||
    record.weightKg === null ||
    !record.activityLevel
  ) return null;

  const profile = createEmptyProfile();
  profile.personalDetails = {
    ...profile.personalDetails,
    fullName: record.name,
    age: record.age,
    gender: record.gender ?? "",
    heightCm: record.heightCm,
    weightKg: record.weightKg,
    activityLevel: record.activityLevel,
  };
  profile.nutritionalInformation.primaryGoal = "general_health";
  return profile;
}

function targetFor(
  key: NutrientKey,
  record: DatasetParticipant,
): number | null {
  const profile = buildProfile(record);
  if (!profile) return null;
  const result = processUserProfile(profile);
  if (!result.success) return null;
  if (key === "caloriesKcal") return result.processed.energy.selectedCalories;
  if (key === "proteinG") return result.processed.macronutrients.protein.selectedGrams;
  if (key === "carbohydratesG") return result.processed.macronutrients.carbohydrates.grams;
  if (key === "fatG") return result.processed.macronutrients.fat.grams;
  return null;
}

function classify(actual: number | null, target: number | null): Pick<NutrientAssessment, "status" | "severity" | "difference" | "percentageOfTarget"> {
  if (actual === null || target === null || target <= 0) {
    return { status: "not_assessable", severity: "not_assessable", difference: null, percentageOfTarget: null };
  }
  const ratio = actual / target;
  const percentageOfTarget = round(ratio * 100);
  const difference = round(actual - target);
  if (ratio < 0.6) return { status: "significantly_below", severity: "significant", difference, percentageOfTarget };
  if (ratio < 0.75) return { status: "below_target", severity: "moderate", difference, percentageOfTarget };
  if (ratio < 0.9) return { status: "below_target", severity: "mild", difference, percentageOfTarget };
  if (ratio <= 1.1) return { status: "adequate", severity: "adequate", difference, percentageOfTarget };
  if (ratio <= 1.25) return { status: "above_reference", severity: "mild", difference, percentageOfTarget };
  if (ratio <= 1.5) return { status: "above_reference", severity: "moderate", difference, percentageOfTarget };
  return { status: "significantly_above", severity: "significant", difference, percentageOfTarget };
}

function foodEvidence(record: DatasetParticipant, key: NutrientKey): string {
  const foods = Object.values(record.meals).flat().filter(Boolean);
  if (foods.length === 0) return "No meal details were recorded, so a food-based explanation is not available.";
  const text = foods.join(" ").toLowerCase();
  if (key === "proteinG" && !/(egg|dal|lentil|bean|paneer|tofu|chicken|fish|meat|yogurt|curd|milk|nut)/.test(text)) {
    return "The available data suggests the recorded meals contain few clearly identifiable protein-rich foods.";
  }
  if (key === "dietaryFibreG" && !/(vegetable|fruit|salad|oat|whole|brown rice|dal|lentil|bean)/.test(text)) {
    return "Lower fibre may be associated with the limited fibre-rich foods recorded in the available meals.";
  }
  return "This is a calculated comparison with the selected reference; the available meal text does not establish a cause.";
}

function recommendations(key: NutrientKey, record: DatasetParticipant): string[] {
  const dietaryType = record.gender ? undefined : undefined;
  void dietaryType;
  const candidates = FOOD_DATABASE.filter((food) => {
    if (key === "proteinG") return food.proteinGrams >= 15 || food.tags.includes("high_protein");
    if (key === "dietaryFibreG") return food.tags.includes("high_fiber");
    if (key === "carbohydratesG") return food.carbohydrateGrams <= 35;
    return false;
  }).slice(0, 3).map((food) => food.name);
  return candidates.length > 0 ? candidates : ["Review suitable foods in the planner before changing intake."];
}

function assess(record: DatasetParticipant): ParticipantNutritionAnalysis {
  const analyzable = buildProfile(record) !== null;
  const nutrients = NUTRIENTS.map(({ key, label, unit }) => {
    const actual = record.nutrition[key];
    const target = targetFor(key, record);
    const classified = classify(actual, target);
    const isGap = classified.status === "below_target" || classified.status === "significantly_below" || classified.status === "above_reference" || classified.status === "significantly_above";
    return {
      key, label, unit, actual, target, ...classified,
      explanation: isGap ? foodEvidence(record, key) : "The recorded value is within the calculated reference range.",
      recommendations: isGap && (classified.status === "below_target" || classified.status === "significantly_below") ? recommendations(key, record) : [],
    } satisfies NutrientAssessment;
  });
  const gaps = nutrients.filter((item) => item.status !== "adequate" && item.status !== "not_assessable");
  const strengths = nutrients.filter((item) => item.status === "adequate");
  const gapText = gaps.length > 0 ? `Main areas to review: ${gaps.slice(0, 3).map((item) => item.label).join(", ")}.` : "No below-target or above-reference values were identified among assessable nutrients.";
  return {
    participantId: record.participantId,
    name: record.name,
    age: record.age,
    gender: record.genderSource,
    heightCm: record.heightCm,
    weightKg: record.weightKg,
    activity: record.activityLevelSource,
    qualityStatus: record.quality.status,
    qualityIssues: record.quality.issues,
    analyzable,
    summary: analyzable ? gapText : "This record needs more valid age, height, weight, or activity data before calculated comparisons can be made.",
    gaps,
    strengths,
    nutrients,
    mealAnalysis: Object.entries(record.meals).map(([meal, foods]) => ({
      meal: meal.replace(/([A-Z])/g, " $1"),
      foods,
      notes: foods.length > 0 ? `${foods.length} recorded food item(s).` : "No food items recorded.",
    })),
  };
}

export function analyzeDataset(records: DatasetParticipant[]): DatasetNutritionAnalysis {
  const participants = records.map(assess);
  const analyzable = participants.filter((participant) => participant.analyzable);
  const completeNutritionParticipants = participants.filter((participant) => participant.nutrients.every((nutrient) => nutrient.actual !== null)).length;
  const averages = NUTRIENTS.map(({ key, label, unit }) => {
    const values = records.map((record) => record.nutrition[key]).filter((value): value is number => value !== null && Number.isFinite(value));
    return { label, unit, value: values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null, count: values.length };
  });
  const gapCounts = new Map<string, number>();
  for (const participant of analyzable) for (const gap of participant.gaps) gapCounts.set(gap.label, (gapCounts.get(gap.label) ?? 0) + 1);
  const common = [...gapCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const severityCounts = new Map<string, number>();
  for (const participant of participants) for (const nutrient of participant.nutrients) severityCounts.set(nutrient.severity, (severityCounts.get(nutrient.severity) ?? 0) + 1);
  const severityTotal = [...severityCounts.values()].reduce((sum, value) => sum + value, 0);
  return {
    totalParticipants: records.length,
    analyzedParticipants: analyzable.length,
    completeNutritionParticipants,
    commonGap: common ? { label: common[0], count: common[1], percentage: analyzable.length ? round((common[1] / analyzable.length) * 100) : 0 } : null,
    averages,
    severityDistribution: ["adequate", "mild", "moderate", "significant", "not_assessable"].map((label) => ({ label, count: severityCounts.get(label) ?? 0, percentage: severityTotal ? round(((severityCounts.get(label) ?? 0) / severityTotal) * 100) : 0 })),
    participants,
    methodology: [
      "Calories, protein, carbohydrates, and fat use the application's general-health calculation engine when age, sex, height, weight, and activity are usable.",
      "Fibre, sugar, and sodium are shown as not assessable because this project does not define participant-specific reference targets for them.",
      "Adequate is 90–110% of target; mild, moderate, and significant bands are transparent relative bands, not medical diagnoses.",
      "Explanations use only recorded meal text and are phrased as possible contributors, never established medical causes.",
    ],
  };
}
