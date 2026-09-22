"use client";

/** Phase 3 — small presentational pieces shared by the weekly planner. */
import type { ReactNode } from "react";
import { Card } from "@/components/ui/core";
import { cn } from "@/lib/cn";
import type { WeeklyPlanDay, WeeklyTargets } from "@/services/diet/weeklyPlanner";

export function fmt(value: number, digits = 0): string {
  return Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: digits }) : "—";
}

/** "1,850 / 2,000 kcal" with a subtle on/off-target tone. */
export function TargetIndicator({
  label,
  value,
  target,
  unit,
  tolerance = 0.1,
}: {
  label: string;
  value: number;
  target: number | null;
  unit: string;
  tolerance?: number;
}) {
  const onTarget = target !== null && target > 0 && Math.abs(value - target) / target <= tolerance;
  const pct = target && target > 0 ? Math.min(100, Math.round((value / target) * 100)) : null;
  return (
    <div className="rounded-[10px] border border-line bg-canvas px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium text-muted">{label}</span>
        {target !== null && (
          <span className={cn("text-[10px] font-semibold", onTarget ? "text-brand-400" : "text-muted")}>
            {onTarget ? "On target" : pct !== null ? `${pct}%` : ""}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-sm font-bold text-ink">
        {fmt(value, unit === "kcal" ? 0 : 1)}
        {target !== null && <span className="font-medium text-muted"> / {fmt(target, unit === "kcal" ? 0 : 0)}</span>}
        <span className="ml-1 text-xs font-medium text-muted">{unit}</span>
      </p>
      {pct !== null && (
        <div className="mt-1.5 h-1 overflow-hidden rounded-pill bg-line/60" aria-hidden="true">
          <div className={cn("h-full rounded-pill", onTarget ? "bg-brand-500" : "bg-brand-300")} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

export function DailyTotalsCard({ day, targets }: { day: WeeklyPlanDay; targets: WeeklyTargets }) {
  const t = day.plan.dailyTotals;
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-brand-50/60 px-5 py-3">
        <h3 className="text-sm font-bold text-ink">Daily total · {day.label}</h3>
        <span className="text-xs text-muted">{day.plan.meals.length} meals</span>
      </div>
      <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
        <TargetIndicator label="Calories" value={t.calories} target={targets.calories} unit="kcal" />
        <TargetIndicator label="Protein" value={t.protein} target={targets.protein} unit="g" tolerance={0.15} />
        <TargetIndicator label="Carbs" value={t.carbohydrates} target={targets.carbohydrates} unit="g" tolerance={0.15} />
        <TargetIndicator label="Fat" value={t.fat} target={targets.fat} unit="g" tolerance={0.15} />
      </div>
      <p className="px-4 pb-3 text-[11px] text-muted">
        Fibre: not available — the food database does not carry fibre values, so none are shown.
      </p>
    </Card>
  );
}

export function Stat({ label, value, unit, children }: { label: string; value: string; unit?: string; children?: ReactNode }) {
  return (
    <div className="rounded-[10px] border border-line bg-canvas px-3 py-2">
      <p className="text-[11px] font-medium text-muted">{label}</p>
      <p className="text-sm font-bold text-ink">
        {value}
        {unit && <span className="ml-0.5 text-xs font-medium text-muted">{unit}</span>}
      </p>
      {children}
    </div>
  );
}
