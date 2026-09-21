"use client";

/**
 * Part 9 — restriction check summary.
 *
 * Reports EXACTLY what the independent validator returned. It never says
 * "safe" or "100% safe": the honest claim is that the plan was checked
 * against the information the user provided.
 */
import { CheckCircle2, Minus, ShieldAlert, XCircle } from "lucide-react";
import type { DietPlan, PlanCheckOutcome } from "@/types/profile";
import { Card, CardBody } from "@/components/ui/core";

const CHECK_LABELS: Record<string, string> = {
  allergies: "Declared allergies",
  intolerances: "Declared intolerances",
  dietaryType: "Dietary pattern",
  foodsToAvoid: "Foods to avoid",
  mealStructure: "Meal structure and portions",
  nutrition: "Nutrition totals",
};

function OutcomeIcon({ outcome }: { outcome: PlanCheckOutcome }) {
  if (outcome === "passed") {
    return (
      <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-400" aria-hidden="true" />
    );
  }
  if (outcome === "failed") {
    return <XCircle className="h-4 w-4 shrink-0 text-danger-600" aria-hidden="true" />;
  }
  return <Minus className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />;
}

function outcomeText(outcome: PlanCheckOutcome): string {
  if (outcome === "passed") return "Checked";
  if (outcome === "failed") return "Problem found";
  return "Nothing declared";
}

export function SafetySummary({ plan }: { plan: DietPlan }) {
  const entries = Object.entries(plan.validation.checks) as [
    string,
    PlanCheckOutcome,
  ][];

  return (
    <Card className="break-inside-avoid">
      <div className="border-b border-line bg-brand-50/60 px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
          <ShieldAlert className="h-4 w-4 text-brand-400" aria-hidden="true" />
          Restriction check
        </h2>
        <p className="mt-0.5 text-xs text-muted">
          {plan.validation.isValid
            ? "This plan passed every check against the information you provided."
            : "This plan requires review — see the problems listed below."}
        </p>
      </div>
      <CardBody>
        <ul className="space-y-2">
          {entries.map(([key, outcome]) => (
            <li key={key} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm text-ink">
                <OutcomeIcon outcome={outcome} />
                {CHECK_LABELS[key] ?? key}
              </span>
              <span
                className={
                  outcome === "failed"
                    ? "text-xs font-bold text-danger-600"
                    : outcome === "passed"
                      ? "text-xs font-semibold text-brand-400"
                      : "text-xs font-medium text-muted"
                }
              >
                {outcomeText(outcome)}
              </span>
            </li>
          ))}
        </ul>

        {plan.validation.errors.length > 0 && (
          <ul className="mt-4 space-y-1.5 rounded-[10px] bg-danger-50 p-3">
            {plan.validation.errors.map((error) => (
              <li key={error} className="text-xs leading-relaxed text-danger-700">
                · {error}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-4 text-xs leading-relaxed text-muted">
          Checks are based only on the allergies, intolerances and restrictions
          you entered, and on the approximate ingredient data in the local food
          dataset. Always check ingredients yourself before eating.
        </p>
      </CardBody>
    </Card>
  );
}
