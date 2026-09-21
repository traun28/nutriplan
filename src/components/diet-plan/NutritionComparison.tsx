"use client";

/**
 * Part 8 — target vs planned comparison.
 *
 * Targets come from the Part 6 processed profile (via dietPlan.summary);
 * planned values come from dietPlan.dailyTotals, which Part 7 computed
 * from the actual meals. This component never sums anything itself.
 *
 * Every bar has a text equivalent so the information is never carried by
 * colour or shape alone.
 */
import type { DietPlan } from "@/types/profile";
import { roundTo } from "@/lib/numbers";
import { Card, CardBody } from "@/components/ui/core";
import { cn } from "@/lib/cn";

interface Row {
  key: string;
  label: string;
  target: number;
  planned: number;
  unit: string;
  barClass: string;
}

export function NutritionComparison({ plan }: { plan: DietPlan }) {
  const { summary, dailyTotals } = plan;

  const rows: Row[] = [
    {
      key: "calories",
      label: "Calories",
      target: summary.targetCalories,
      planned: dailyTotals.calories,
      unit: "kcal",
      barClass: "bg-brand-700",
    },
    {
      key: "protein",
      label: "Protein",
      target: summary.targetProtein,
      planned: dailyTotals.protein,
      unit: "g",
      barClass: "bg-brand-500",
    },
    {
      key: "carbohydrates",
      label: "Carbohydrates",
      target: summary.targetCarbohydrates,
      planned: dailyTotals.carbohydrates,
      unit: "g",
      barClass: "bg-brand-400",
    },
    {
      key: "fat",
      label: "Fat",
      target: summary.targetFat,
      planned: dailyTotals.fat,
      unit: "g",
      barClass: "bg-accent-400",
    },
  ];

  return (
    <Card>
      <div className="border-b border-line bg-brand-50/60 px-5 py-3.5">
        <h2 className="text-sm font-bold text-ink">Target vs Planned</h2>
        <p className="mt-0.5 text-xs text-muted">
          How today&rsquo;s meals compare with your estimated daily targets.
        </p>
      </div>
      <CardBody className="space-y-5">
        {rows.map((row) => {
          const percent =
            row.target > 0
              ? Math.min(150, roundTo((row.planned / row.target) * 100))
              : 0;
          const difference = roundTo(row.planned - row.target, 1);

          return (
            <div key={row.key}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="text-sm font-semibold text-ink">{row.label}</span>
                <span className="text-sm text-muted">
                  <strong className="text-ink">
                    {roundTo(row.planned).toLocaleString()}
                  </strong>{" "}
                  / {roundTo(row.target).toLocaleString()} {row.unit}
                </span>
              </div>

              <div
                className="mt-2 h-2.5 w-full overflow-hidden rounded-pill bg-line"
                role="img"
                aria-label={`${row.label}: ${roundTo(
                  row.planned,
                )} ${row.unit} planned against a target of ${roundTo(
                  row.target,
                )} ${row.unit}, which is ${percent}% of target.`}
              >
                <div
                  className={cn("h-full rounded-pill transition-all duration-500", row.barClass)}
                  style={{ width: `${Math.min(100, percent)}%` }}
                />
              </div>

              <p className="mt-1.5 text-xs text-muted">
                {percent}% of target ·{" "}
                {difference === 0
                  ? "exactly on target"
                  : `${Math.abs(difference).toLocaleString()} ${row.unit} ${
                      difference > 0 ? "above" : "below"
                    } target`}
              </p>
            </div>
          );
        })}

        <p className="rounded-[10px] bg-canvas p-3 text-xs leading-relaxed text-muted">
          Differences of this size are normal — meal plans are built from whole
          portions, so totals land near the target rather than exactly on it.
        </p>
      </CardBody>
    </Card>
  );
}

/** Compact "day at a glance" metric strip used at the top of the page. */
export function DayAtAGlance({ plan }: { plan: DietPlan }) {
  const metrics = [
    {
      label: "Calories",
      planned: `${plan.dailyTotals.calories.toLocaleString()}`,
      target: `${plan.summary.targetCalories.toLocaleString()} kcal target`,
      unit: "kcal",
    },
    {
      label: "Protein",
      planned: `${Math.round(plan.dailyTotals.protein)}`,
      target: `${Math.round(plan.summary.targetProtein)} g target`,
      unit: "g",
    },
    {
      label: "Carbohydrates",
      planned: `${Math.round(plan.dailyTotals.carbohydrates)}`,
      target: `${Math.round(plan.summary.targetCarbohydrates)} g target`,
      unit: "g",
    },
    {
      label: "Fat",
      planned: `${Math.round(plan.dailyTotals.fat)}`,
      target: `${Math.round(plan.summary.targetFat)} g target`,
      unit: "g",
    },
  ];

  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className="rounded-card border border-line bg-surface p-4 shadow-card"
        >
          <dt className="text-xs font-medium text-muted">{metric.label}</dt>
          <dd>
            <p className="mt-1 text-2xl font-extrabold tracking-tight text-ink">
              {metric.planned}
              <span className="ml-1 text-sm font-semibold text-muted">
                {metric.unit}
              </span>
            </p>
            <p className="text-xs text-muted">{metric.target}</p>
          </dd>
        </div>
      ))}
    </dl>
  );
}
