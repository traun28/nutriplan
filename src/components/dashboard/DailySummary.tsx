"use client";

/**
 * Phase 2 — daily nutrition summary: consumed / target / remaining for
 * calories and macros, with progress bars in the existing style.
 *
 * Targets come from the Part 6 processed profile; consumed values are the
 * shared `sumEntries` totals from DayLogContext. Nothing is recomputed here.
 */
import { ArrowRight, Calculator, Flame } from "lucide-react";
import { Button, Card, CardBody } from "@/components/ui/core";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { remainingOf } from "@/services/foodLog/calculations";
import type { DailyTargets, DailyTotals } from "@/services/foodLog/types";
import { cn } from "@/lib/cn";

interface Props {
  totals: DailyTotals;
  targets: DailyTargets;
  loading: boolean;
  /** Whether targets exist at all (drives the empty state). */
  hasTargets: boolean;
  targetsStale?: boolean;
}

export function DailySummary({ totals, targets, loading, hasTargets, targetsStale }: Props) {
  const rows = [
    {
      key: "calories",
      label: "Calories",
      unit: "kcal",
      consumed: totals.calories,
      target: targets.calories,
      barClass: "bg-brand-700",
      emphasis: true,
      showRemaining: true,
    },
    {
      key: "protein",
      label: "Protein",
      unit: "g",
      consumed: totals.protein,
      target: targets.protein,
      barClass: "bg-brand-500",
      showRemaining: true,
    },
    {
      key: "carbohydrates",
      label: "Carbohydrates",
      unit: "g",
      consumed: totals.carbohydrates,
      target: targets.carbohydrates,
      barClass: "bg-brand-400",
      showRemaining: false,
    },
    {
      key: "fat",
      label: "Fat",
      unit: "g",
      consumed: totals.fat,
      target: targets.fat,
      barClass: "bg-accent-400",
      showRemaining: false,
    },
  ];

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-brand-50/60 px-5 py-3.5">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
            <Flame className="h-4 w-4 text-brand-400" aria-hidden="true" />
            Daily nutrition summary
          </h2>
          <p className="mt-0.5 text-xs text-muted">Consumed against your calculated daily targets.</p>
        </div>
        {targetsStale && (
          <Button href="/nutrition" size="sm" variant="outline" icon={<Calculator className="h-3.5 w-3.5" />}>
            Targets need recalculating
          </Button>
        )}
      </div>
      <CardBody>
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true" aria-label="Loading nutrition summary">
            {rows.map((row) => (
              <div key={row.key} className="rounded-[10px] border border-line bg-canvas p-4">
                <div className="skeleton h-3 w-16" />
                <div className="skeleton mt-3 h-7 w-24" />
                <div className="skeleton mt-3 h-2 w-full" />
                <div className="skeleton mt-2 h-3 w-20" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {rows.map((row) => {
                const { remaining, over, percent } = remainingOf(row.target, row.consumed);
                return (
                  <div
                    key={row.key}
                    className={cn(
                      "card-hover rounded-[10px] border p-4",
                      row.emphasis ? "border-brand-400/25 bg-brand-50" : "border-line bg-canvas",
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-xs font-medium text-muted">{row.label}</p>
                      {percent !== null && (
                        <span
                          className={cn(
                            "text-[11px] font-bold",
                            over ? "text-accent-300" : "text-brand-400",
                          )}
                        >
                          {percent}%
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-2xl font-extrabold tracking-tight text-ink">
                      {row.consumed.toLocaleString()}
                      <span className="text-sm font-semibold text-muted">
                        {" "}
                        / {row.target === null ? "—" : Math.round(row.target).toLocaleString()} {row.unit}
                      </span>
                    </p>
                    <ProgressBar
                      className="mt-3"
                      size="sm"
                      label={row.label}
                      unit={row.unit}
                      value={row.consumed}
                      target={row.target}
                      barClass={row.barClass}
                    />
                    <p className="mt-2 text-xs text-muted">
                      {row.target === null
                        ? "No target available"
                        : over
                          ? `${over.toLocaleString()} ${row.unit} over target`
                          : row.showRemaining
                            ? `${(remaining ?? 0).toLocaleString()} ${row.unit} remaining`
                            : `${Math.round(row.target).toLocaleString()} ${row.unit} target`}
                    </p>
                  </div>
                );
              })}
            </div>

            {totals.fiber !== null && (
              <p className="mt-3 text-xs text-muted">
                Fibre logged: <strong className="text-ink">{totals.fiber} g</strong>
              </p>
            )}

            {!hasTargets && (
              <div className="mt-4 flex flex-col items-start justify-between gap-3 rounded-[10px] border border-dashed border-line bg-surface/60 p-4 sm:flex-row sm:items-center">
                <div>
                  <p className="text-sm font-bold text-ink">No nutrition targets yet</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">
                    Complete your profile and calculate your nutrition to compare what you eat against your daily targets.
                  </p>
                </div>
                <Button href="/nutrition" size="sm" variant="outline" icon={<ArrowRight className="h-3.5 w-3.5" />}>
                  Set up targets
                </Button>
              </div>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
