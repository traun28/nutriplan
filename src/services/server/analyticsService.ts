/**
 * Phase 5 — assembles daily / weekly analytics for the signed-in user from
 * stored records only. Targets come from the saved processed profile
 * (recomputed when stale, exactly like the planner does).
 */
import type { UserProfile } from "@/types/profile";
import { getProcessed, getProfile } from "@/services/server/repository";
import { processUserProfile } from "@/services/nutrition/nutritionProcessor";
import { isProcessedProfileCurrent } from "@/lib/freshness";
import { getSettings, listFoodLogsForDate, listFoodLogsInRange, listWaterForDate, listWaterInRange } from "@/services/server/foodLogRepository";
import { getCurrentMealPlan } from "@/services/server/mealPlanRepository";
import { listProgressInRange } from "@/services/server/progressRepository";
import { shiftDateKey, sumEntries, targetsFromProcessed } from "@/services/foodLog/calculations";
import { DEFAULT_WATER_TARGET_ML } from "@/services/foodLog/water";
import { dayIndexForDate } from "@/services/diet/weeklyPlanner";
import { calculateBmi } from "@/services/nutrition/bmi";
import {
  COMPARISON_ROWS,
  NUTRIENTS,
  assessNutrients,
  averageDayPoints,
  buildDayPoints,
  compareMetrics,
  comparePlannedVsActual,
  computeDailyScore,
  explainSource,
  foodContributions,
  mealContributions,
  suggestFoodsForGap,
  type NutrientKey,
} from "@/services/analytics/nutritionAnalysis";
import { buildDailyInsights, buildWeeklyInsights } from "@/services/analytics/insights";

async function loadTargets(userId: number) {
  const profile = await getProfile(userId);
  let processed = await getProcessed(userId);
  let stale = false;
  if (profile && (!processed || !isProcessedProfileCurrent(processed, profile))) {
    const result = processUserProfile(profile);
    processed = result.success ? result.processed : processed;
    stale = !result.success;
  }
  const targets = targetsFromProcessed(processed && processed.status === "complete" ? processed : null);
  return { profile, targets, stale, hasTargets: targets.calories !== null };
}

/** Monday-based week containing `date` (matches the planner's default Day 1 = Monday). */
export function weekRangeFor(date: string): { start: string; end: string; dates: string[] } {
  const [y, m, d] = date.split("-").map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  const start = shiftDateKey(date, -dow);
  const dates = Array.from({ length: 7 }, (_, i) => shiftDateKey(start, i));
  return { start, end: dates[6], dates };
}

async function plannedMealsFor(userId: number, date: string) {
  const plan = await getCurrentMealPlan(userId);
  if (!plan) return { plan: null, meals: null as null | { type: string; label: string; name: string; calories: number; proteinGrams: number; carbohydrateGrams: number; fatGrams: number }[] };
  const index = dayIndexForDate(plan.startDate, date);
  const day = index === null ? null : plan.data.days.find((d) => d.dayIndex === index);
  return { plan: { id: plan.id, name: plan.name }, meals: day ? day.plan.meals.map((m) => ({ type: m.type, label: m.label, name: m.name, calories: m.calories, proteinGrams: m.proteinGrams, carbohydrateGrams: m.carbohydrateGrams, fatGrams: m.fatGrams })) : null };
}

export async function buildDailyAnalytics(userId: number, date: string, today: string, hourNow: number) {
  const yesterday = shiftDateKey(date, -1);
  const week = weekRangeFor(date);
  const [{ profile, targets, hasTargets, stale }, entries, water, prevEntries, prevWater, settings, planned, weights] = await Promise.all([
    loadTargets(userId),
    listFoodLogsForDate(userId, date),
    listWaterForDate(userId, date),
    listFoodLogsForDate(userId, yesterday),
    listWaterForDate(userId, yesterday),
    getSettings(userId),
    plannedMealsFor(userId, date),
    listProgressInRange(userId, week.start, week.end),
  ]);
  const totals = sumEntries(entries);
  const waterMl = water.reduce((s, w) => s + w.amountMl, 0);
  const waterTargetMl = settings.waterTargetMl ?? DEFAULT_WATER_TARGET_ML;
  const assessments = assessNutrients(totals, targets, entries.length > 0);
  const calorieRoom = targets.calories !== null ? targets.calories - totals.calories : null;
  const loggedIds = entries.map((e) => e.foodId);

  const nutrients = NUTRIENTS.filter((n) => n.key !== "fiber").map(({ key, label }) => {
    const meals = mealContributions(entries, key as NutrientKey);
    const assessment = assessments.find((a) => a.key === key)!;
    return {
      key,
      meals,
      foods: foodContributions(entries, key as NutrientKey),
      explanation: explainSource(label, meals),
      suggestions: assessment.status === "gap" ? suggestFoodsForGap(key as NutrientKey, profile as UserProfile | null, { excludeFoodIds: loggedIds, calorieRoom, limit: 5 }) : [],
    };
  });

  const plannedVsActual = planned.meals ? comparePlannedVsActual(planned.meals, entries) : null;
  const score = computeDailyScore({ totals, targets, entries, plannedSlots: planned.meals ? planned.meals.map((m) => m.type) : null, waterMl, waterTargetMl });

  const prevTotals = sumEntries(prevEntries);
  const comparison =
    prevEntries.length > 0 || entries.length > 0
      ? compareMetrics(
          { calories: entries.length ? totals.calories : null, protein: entries.length ? totals.protein : null, carbohydrates: entries.length ? totals.carbohydrates : null, fat: entries.length ? totals.fat : null, waterMl: water.length ? waterMl : null, mealsLogged: entries.length ? new Set(entries.map((e) => e.mealType)).size : null },
          { calories: prevEntries.length ? prevTotals.calories : null, protein: prevEntries.length ? prevTotals.protein : null, carbohydrates: prevEntries.length ? prevTotals.carbohydrates : null, fat: prevEntries.length ? prevTotals.fat : null, waterMl: prevWater.length ? prevWater.reduce((s, w) => s + w.amountMl, 0) : null, mealsLogged: prevEntries.length ? new Set(prevEntries.map((e) => e.mealType)).size : null },
          COMPARISON_ROWS,
        )
      : null;

  const insights = buildDailyInsights({ isToday: date === today, entries: entries.length, assessments, plannedVsActual, comparison, waterMl, waterTargetMl, hourNow, weightDaysThisWeek: weights.length });

  return {
    date,
    hasTargets,
    targetsStale: stale,
    targets,
    totals,
    entryCount: entries.length,
    entries,
    water: { totalMl: waterMl, targetMl: waterTargetMl, entries: water.length },
    assessments,
    nutrients,
    score,
    plan: planned.plan,
    plannedVsActual,
    comparison: { label: "Today vs yesterday", previousDate: yesterday, rows: comparison },
    insights,
  };
}

export async function buildWeeklyAnalytics(userId: number, anchorDate: string) {
  const week = weekRangeFor(anchorDate);
  const prev = weekRangeFor(shiftDateKey(week.start, -7));
  const [{ profile, targets, hasTargets }, entries, water, prevEntries, prevWater, settings, weights, prevWeights] = await Promise.all([
    loadTargets(userId),
    listFoodLogsInRange(userId, week.start, week.end),
    listWaterInRange(userId, week.start, week.end),
    listFoodLogsInRange(userId, prev.start, prev.end),
    listWaterInRange(userId, prev.start, prev.end),
    getSettings(userId),
    listProgressInRange(userId, week.start, week.end),
    listProgressInRange(userId, prev.start, prev.end),
  ]);
  const waterTargetMl = settings.waterTargetMl ?? DEFAULT_WATER_TARGET_ML;
  const points = buildDayPoints(week.dates, entries, water);
  const prevPoints = buildDayPoints(prev.dates, prevEntries, prevWater);
  const averages = averageDayPoints(points);
  const prevAverages = averageDayPoints(prevPoints);
  const weekComparison =
    averages.daysWithFood > 0 || prevAverages.daysWithFood > 0
      ? compareMetrics(
          { calories: averages.calories, protein: averages.protein, carbohydrates: averages.carbohydrates, fat: averages.fat, waterMl: averages.waterMl, mealsLogged: averages.daysWithFood ? averages.mealsLogged : null },
          { calories: prevAverages.calories, protein: prevAverages.protein, carbohydrates: prevAverages.carbohydrates, fat: prevAverages.fat, waterMl: prevAverages.waterMl, mealsLogged: prevAverages.daysWithFood ? prevAverages.mealsLogged : null },
          COMPARISON_ROWS,
        )
      : null;
  const insights = buildWeeklyInsights({ points, averages, targets, waterTargetMl, weekComparison, weightDays: weights.length });
  const weightPoints = week.dates.map((date) => ({ date, weightKg: weights.find((w) => w.entryDate === date)?.weightKg ?? null }));
  return {
    range: { start: week.start, end: week.end },
    previousRange: { start: prev.start, end: prev.end },
    hasTargets,
    targets,
    waterTargetMl,
    points,
    averages,
    previousAverages: prevAverages,
    weightPoints,
    comparison: { label: "This week vs previous week", rows: weekComparison },
    insights,
    profileWeightKg: profile?.personalDetails.weightKg ?? null,
    previousWeightDays: prevWeights.length,
  };
}

/** Body metrics using the existing BMI methodology; latest recorded weight when available. */
export function bodyMetrics(profile: UserProfile | null, latestWeightKg: number | null) {
  const heightCm = profile?.personalDetails.heightCm ?? null;
  const profileWeightKg = profile?.personalDetails.weightKg ?? null;
  const currentWeightKg = latestWeightKg ?? profileWeightKg;
  return {
    heightCm,
    profileWeightKg,
    currentWeightKg,
    currentWeightSource: latestWeightKg !== null ? ("Logged" as const) : profileWeightKg !== null ? ("Profile" as const) : null,
    bmi: calculateBmi(currentWeightKg, heightCm),
    goal: profile?.nutritionalInformation.primaryGoal || null,
  };
}
