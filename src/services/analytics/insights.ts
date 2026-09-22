/**
 * Phase 5 — factual insight cards. Every insight quotes the numbers it is
 * built from; none draws a health conclusion. Ranked by priority and cut
 * to a handful; the UI offers "show more".
 */
import type { NutrientAssessment, PlannedVsActual, ComparisonRow, DayPoint } from "@/services/analytics/nutritionAnalysis";
import { formatLitres } from "@/services/foodLog/water";

export type InsightTone = "neutral" | "positive" | "attention";

export interface Insight {
  id: string;
  tone: InsightTone;
  title: string;
  detail: string;
  /** Lower = shown first. */
  priority: number;
  source: "Logged" | "Planned" | "Calculated";
}

export function buildDailyInsights(input: {
  isToday: boolean;
  entries: number;
  assessments: NutrientAssessment[];
  plannedVsActual: PlannedVsActual | null;
  comparison: ComparisonRow[] | null;
  waterMl: number;
  waterTargetMl: number;
  hourNow: number;
  weightDaysThisWeek: number | null;
}): Insight[] {
  const out: Insight[] = [];
  const { isToday, entries, assessments, plannedVsActual, comparison, waterMl, waterTargetMl, hourNow } = input;
  const day = isToday ? "today" : "on this day";

  if (entries === 0) {
    out.push({ id: "no-food", tone: "neutral", title: `Nothing logged ${day} yet`, detail: "Nutrition analysis appears once at least one food is logged.", priority: 0, source: "Logged" });
    return out;
  }

  if (plannedVsActual) {
    const missing = plannedVsActual.meals.filter((m) => !m.logged);
    const breakfast = missing.find((m) => m.slot === "breakfast");
    if (breakfast && (!isToday || hourNow >= 10)) {
      out.push({ id: "bf-missing", tone: "attention", title: `Breakfast has not been logged ${day}`, detail: `Your plan scheduled “${breakfast.plannedName}” (${breakfast.planned.calories} kcal). Not logged is not the same as skipped — log it if you ate.`, priority: 1, source: "Planned" });
    }
    if (plannedVsActual.plannedCount > 0) {
      out.push({ id: "adherence", tone: plannedVsActual.loggingPercent >= 80 ? "positive" : "neutral", title: `${plannedVsActual.loggedCount} of ${plannedVsActual.plannedCount} planned meals logged`, detail: `Logged calories differ from the plan by ${plannedVsActual.difference.calories >= 0 ? "+" : ""}${plannedVsActual.difference.calories} kcal and protein by ${plannedVsActual.difference.protein >= 0 ? "+" : ""}${plannedVsActual.difference.protein} g.`, priority: 3, source: "Planned" });
    }
  }

  for (const a of assessments) {
    if (a.status === "gap" && a.difference !== null) {
      out.push({ id: `gap-${a.key}`, tone: "attention", title: `Potential ${a.label.toLowerCase()} gap: ${a.percentOfTarget}% of target`, detail: `Estimated ${a.estimated} ${a.unit} logged against a ${a.target} ${a.unit} target — ${a.difference} ${a.unit} below. Based on foods logged so far.`, priority: a.key === "protein" ? 2 : 4, source: "Calculated" });
    } else if (a.status === "excess" && a.difference !== null) {
      out.push({ id: `excess-${a.key}`, tone: "neutral", title: `${a.label} above target: ${a.percentOfTarget}%`, detail: `Estimated ${a.estimated} ${a.unit} against a ${a.target} ${a.unit} target — ${Math.abs(a.difference)} ${a.unit} above.`, priority: a.key === "calories" ? 2 : 5, source: "Calculated" });
    } else if (a.status === "on_target") {
      out.push({ id: `ok-${a.key}`, tone: "positive", title: `${a.label} within 10% of target`, detail: `${a.estimated} ${a.unit} logged against ${a.target} ${a.unit}.`, priority: 6, source: "Calculated" });
    }
  }

  if (comparison) {
    const pro = comparison.find((r) => r.key === "protein");
    if (pro && pro.change !== null && Math.abs(pro.change) >= 5) {
      out.push({ id: "cmp-protein", tone: "neutral", title: `${pro.change > 0 ? "More" : "Less"} protein than yesterday`, detail: `${pro.current} g vs ${pro.previous} g yesterday (${pro.change > 0 ? "+" : ""}${pro.change} g).`, priority: 5, source: "Logged" });
    }
    const cal = comparison.find((r) => r.key === "calories");
    if (cal && cal.change !== null && Math.abs(cal.change) >= 150) {
      out.push({ id: "cmp-cal", tone: "neutral", title: `${Math.abs(cal.change)} kcal ${cal.change > 0 ? "more" : "less"} than yesterday`, detail: `${cal.current} kcal vs ${cal.previous} kcal yesterday.`, priority: 5, source: "Logged" });
    }
  }

  if (waterTargetMl > 0) {
    const pct = Math.round((waterMl / waterTargetMl) * 100);
    if (waterMl === 0) out.push({ id: "water-0", tone: "neutral", title: `No water logged ${day}`, detail: `Your configured water target is ${formatLitres(waterTargetMl)}.`, priority: 7, source: "Logged" });
    else if (pct >= 100) out.push({ id: "water-ok", tone: "positive", title: "Water target reached", detail: `${formatLitres(waterMl)} logged against ${formatLitres(waterTargetMl)}.`, priority: 7, source: "Logged" });
    else out.push({ id: "water-part", tone: "neutral", title: `Water at ${pct}% of target`, detail: `${formatLitres(waterMl)} of ${formatLitres(waterTargetMl)} logged.`, priority: 8, source: "Logged" });
  }

  if (input.weightDaysThisWeek !== null && input.weightDaysThisWeek > 0) {
    out.push({ id: "weight-days", tone: "neutral", title: `Weight recorded on ${input.weightDaysThisWeek} day${input.weightDaysThisWeek === 1 ? "" : "s"} this week`, detail: "From your progress entries.", priority: 9, source: "Logged" });
  }

  return out.sort((a, b) => a.priority - b.priority);
}

export function buildWeeklyInsights(input: {
  points: DayPoint[];
  averages: { calories: number | null; protein: number | null; waterMl: number | null; daysWithFood: number; mealsLogged: number };
  targets: { calories: number | null; protein: number | null };
  waterTargetMl: number;
  weekComparison: ComparisonRow[] | null;
  weightDays: number;
}): Insight[] {
  const out: Insight[] = [];
  const { points, averages, targets, weekComparison, weightDays } = input;
  if (averages.daysWithFood === 0) {
    out.push({ id: "w-none", tone: "neutral", title: "No food logged this week", detail: "Weekly analytics appear once meals are logged on at least one day.", priority: 0, source: "Logged" });
    return out;
  }
  out.push({ id: "w-days", tone: averages.daysWithFood >= 5 ? "positive" : "neutral", title: `Food logged on ${averages.daysWithFood} of ${points.length} days`, detail: `${averages.mealsLogged} meal slots logged in total. Averages below use only the days with entries.`, priority: 1, source: "Logged" });
  if (averages.calories !== null && targets.calories) {
    const pct = Math.round((averages.calories / targets.calories) * 100);
    const rel = pct > 110 ? "above" : pct < 90 ? "below" : "close to";
    out.push({ id: "w-cal", tone: rel === "close to" ? "positive" : "neutral", title: `Average calorie intake is ${rel} your daily target`, detail: `${averages.calories} kcal/day on logged days vs a ${targets.calories} kcal target (${pct}%).`, priority: 2, source: "Calculated" });
  }
  if (averages.protein !== null && targets.protein) {
    const pct = Math.round((averages.protein / targets.protein) * 100);
    out.push({ id: "w-pro", tone: pct >= 90 && pct <= 110 ? "positive" : "attention", title: `Average protein at ${pct}% of target`, detail: `${averages.protein} g/day on logged days vs a ${targets.protein} g target.`, priority: 3, source: "Calculated" });
  }
  if (weekComparison) {
    const cal = weekComparison.find((r) => r.key === "calories");
    if (cal && cal.change !== null) {
      out.push({ id: "w-cmp", tone: "neutral", title: `Average calories ${cal.change >= 0 ? "up" : "down"} ${Math.abs(cal.change)} kcal vs last week`, detail: `${cal.current} kcal/day this week vs ${cal.previous} kcal/day last week, on days with entries.`, priority: 4, source: "Logged" });
    }
  }
  if (averages.waterMl !== null && input.waterTargetMl > 0) {
    out.push({ id: "w-water", tone: "neutral", title: `Average water ${formatLitres(averages.waterMl)} per logged day`, detail: `Against a ${formatLitres(input.waterTargetMl)} daily target, on ${points.filter((p) => p.waterMl !== null).length} days with water entries.`, priority: 5, source: "Logged" });
  }
  if (weightDays > 0) out.push({ id: "w-weight", tone: "neutral", title: `Weight recorded on ${weightDays} day${weightDays === 1 ? "" : "s"} this week`, detail: "From your progress entries.", priority: 6, source: "Logged" });
  return out.sort((a, b) => a.priority - b.priority);
}
