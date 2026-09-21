"use client";

/**
 * Part 8 — the supporting column of the diet dashboard:
 * personalisation factors, dietary considerations, hydration and
 * general recommendations. All values come from the profile and the
 * generated plan; nothing is hard-coded per user.
 */
import { Check, Droplets, Info, Lightbulb, ShieldCheck } from "lucide-react";
import type { DietPlan, UserProfile } from "@/types/profile";
import {
  allergenLabel,
  FOOD_AVAILABILITY_OPTIONS,
  intoleranceLabel,
  labelFor,
  MEAL_PREP_TIME_OPTIONS,
} from "@/data/options";
import { titleCase } from "@/lib/normalize";
import { Card, CardBody } from "@/components/ui/core";

/* ------------------------------------------------------------------ */
/* Why this plan is personalised                                       */
/* ------------------------------------------------------------------ */

export function PersonalisationCard({ plan }: { plan: DietPlan }) {
  if (plan.personalisationFactors.length === 0) return null;

  return (
    <Card className="break-inside-avoid">
      <div className="border-b border-line bg-brand-50/60 px-5 py-3.5">
        <h2 className="text-sm font-bold text-ink">Why this plan is personalised</h2>
      </div>
      <CardBody>
        <p className="text-xs text-muted">Your plan considered:</p>
        <ul className="mt-3 space-y-2">
          {plan.personalisationFactors.map((factor) => (
            <li key={factor} className="flex items-start gap-2.5">
              <Check
                className="mt-0.5 h-4 w-4 shrink-0 text-brand-600"
                strokeWidth={3}
                aria-hidden="true"
              />
              <span className="text-sm leading-relaxed text-ink">{factor}</span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Dietary considerations (restrictions actually used)                 */
/* ------------------------------------------------------------------ */

export function DietaryConsiderationsCard({
  profile,
}: {
  profile: UserProfile;
}) {
  const allergies = profile.allergies.filter((entry) => entry !== "none");
  const hasRestrictions =
    allergies.length > 0 ||
    profile.intolerances.length > 0 ||
    profile.foodsToAvoid.length > 0;

  return (
    <Card className="break-inside-avoid">
      <div className="border-b border-line bg-brand-50/60 px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
          <ShieldCheck className="h-4 w-4 text-brand-600" aria-hidden="true" />
          Dietary considerations
        </h2>
      </div>
      <CardBody>
        <dl className="space-y-3">
          <ChipGroup
            label="Allergies"
            values={allergies.map(allergenLabel)}
            emptyText="None declared"
            tone="danger"
          />
          <ChipGroup
            label="Intolerances"
            values={profile.intolerances.map(intoleranceLabel)}
            emptyText="None declared"
            tone="warning"
          />
          <ChipGroup
            label="Foods to avoid"
            values={profile.foodsToAvoid.map(titleCase)}
            emptyText="None declared"
          />
        </dl>

        <p className="mt-4 rounded-[10px] bg-canvas p-3 text-xs leading-relaxed text-muted">
          {hasRestrictions
            ? "Your plan was checked against the dietary restrictions you provided, both when meals were selected and again before the plan was shown."
            : "You have not declared any allergies, intolerances or foods to avoid, so no exclusions were applied."}
        </p>
      </CardBody>
    </Card>
  );
}

function ChipGroup({
  label,
  values,
  emptyText,
  tone = "neutral",
}: {
  label: string;
  values: string[];
  emptyText: string;
  tone?: "neutral" | "danger" | "warning";
}) {
  const toneClass =
    tone === "danger"
      ? "border-danger-100 bg-danger-50 text-danger-700"
      : tone === "warning"
        ? "border-accent-300/70 bg-accent-200/40 text-accent-600"
        : "border-line bg-white text-ink";

  return (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-1">
        {values.length === 0 ? (
          <span className="text-sm font-semibold text-muted">{emptyText}</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {values.map((value) => (
              <span
                key={value}
                className={`rounded-pill border px-2.5 py-0.5 text-xs font-semibold ${toneClass}`}
              >
                {value}
              </span>
            ))}
          </div>
        )}
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hydration + practical considerations                                */
/* ------------------------------------------------------------------ */

export function PlanConsiderationsCard({ profile }: { profile: UserProfile }) {
  const constraints = profile.practicalConstraints;
  const notes: string[] = [];

  if (constraints.mealPreparationTime) {
    notes.push(
      `Preparation time: ${labelFor(
        MEAL_PREP_TIME_OPTIONS,
        constraints.mealPreparationTime,
      ).toLowerCase()}`,
    );
  }
  if (constraints.foodAvailability.length > 0) {
    notes.push(
      `Food availability: ${constraints.foodAvailability
        .map((id) => labelFor(FOOD_AVAILABILITY_OPTIONS, id).toLowerCase())
        .join(", ")}`,
    );
  }
  if (constraints.typicalDailySchedule.trim()) {
    notes.push(constraints.typicalDailySchedule.trim());
  }

  return (
    <Card className="break-inside-avoid">
      <div className="border-b border-line bg-brand-50/60 px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
          <Droplets className="h-4 w-4 text-brand-600" aria-hidden="true" />
          Hydration &amp; plan considerations
        </h2>
      </div>
      <CardBody>
        <div className="rounded-[10px] border border-line bg-canvas p-3.5">
          <p className="text-xs font-medium text-muted">Typical water intake</p>
          <p className="mt-0.5 text-lg font-bold text-ink">
            {profile.waterIntake.litresPerDay !== null
              ? `${profile.waterIntake.litresPerDay} L / day`
              : "Not provided"}
          </p>
          {profile.waterIntake.litresPerDay === null && (
            <p className="mt-1 text-xs text-muted">
              You can add this in the Food Intake step.
            </p>
          )}
        </div>

        {notes.length > 0 && (
          <ul className="mt-4 space-y-2">
            {notes.map((note) => (
              <li key={note} className="flex items-start gap-2 text-xs leading-relaxed text-muted">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600" aria-hidden="true" />
                {note}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Recommendations                                                     */
/* ------------------------------------------------------------------ */

export function RecommendationsCard({ plan }: { plan: DietPlan }) {
  if (plan.recommendations.length === 0) return null;

  return (
    <Card className="break-inside-avoid">
      <div className="border-b border-line bg-brand-50/60 px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
          <Lightbulb className="h-4 w-4 text-brand-600" aria-hidden="true" />
          General recommendations
        </h2>
      </div>
      <CardBody>
        <ul className="grid gap-3 sm:grid-cols-2">
          {plan.recommendations.map((recommendation) => (
            <li
              key={recommendation}
              className="rounded-[10px] border border-line bg-canvas p-3.5 text-sm leading-relaxed text-ink"
            >
              {recommendation}
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
