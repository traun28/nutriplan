"use client";

import { RequireAuth } from "@/components/auth/RequireAuth";

/**
 * Part 6 — "Your Nutrition Profile" dashboard.
 *
 * Presentation only: every number shown here comes from the processed
 * profile produced by `services/nutrition`. No formula is evaluated in
 * this file.
 */
import {
  Activity,
  ArrowRight,
  Calculator,
  ChevronDown,
  CircleAlert,
  Flame,
  Info,
  RefreshCw,
  Scale,
  Target,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { useProfile } from "@/context/ProfileContext";
import { useNutrition } from "@/context/NutritionContext";
import type { ProcessedProfile } from "@/types/profile";
import { formatDateTime, formatNumber } from "@/lib/numbers";
import {
  ACTIVITY_FACTORS,
  FAT_SHARE_OF_CALORIES,
  MACRO_CALORIES_PER_GRAM,
  MIFFLIN,
} from "@/services/nutrition/constants";
import { proteinPercentOfCalories } from "@/services/nutrition/macronutrients";
import { Badge, Button, Card, CardBody, EmptyState } from "@/components/ui/core";
import { NextStepCard } from "@/components/common/NextStepCard";
import { cn } from "@/lib/cn";

const BMI_TONE: Record<string, string> = {
  underweight: "bg-accent-200/50 text-accent-300 border-accent-300",
  normal: "bg-brand-50 text-brand-400 border-brand-400/25",
  overweight: "bg-accent-200/50 text-accent-300 border-accent-300",
  obesity: "bg-danger-50 text-danger-700 border-danger-500/30",
};

function NutritionDashboardView() {
  const { profile, hydrated, hasSavedProfile, completion } = useProfile();
  const { processed, status, errors, isStale, recalculate } = useNutrition();

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-10 sm:py-14">
        <header className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-400">
            Nutrition profile
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            Your Nutrition Profile
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Loading your nutrition targets…
          </p>
        </header>
        <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
          <div className="h-56 animate-pulse rounded-card bg-line/40" />
          <div className="h-56 animate-pulse rounded-card bg-line/30" />
        </div>
      </div>
    );
  }

  /* ---------------------- no profile at all ---------------------- */
  if (!hasSavedProfile && !completion.hasAnyData) {
    return (
      <div className="mx-auto grid max-w-3xl place-items-center px-5 py-24">
        <EmptyState
          icon={<Calculator className="h-6 w-6" aria-hidden="true" />}
          title="No nutrition profile is available yet"
          description="Complete and save your profile first. Your BMI, energy estimate and macronutrient targets will then be calculated from the information you provided."
          action={
            <Button href="/planner" icon={<ArrowRight className="h-4 w-4" />}>
              Create My Profile
            </Button>
          }
        />
      </div>
    );
  }

  const showResults = processed !== null && processed.status === "complete";

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:py-14">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-400">
            Nutrition profile
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            Your Nutrition Profile
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
            Estimated values calculated from your saved profile. These are
            general planning estimates, not medical advice.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <Button
            onClick={() => recalculate()}
            loading={status === "processing"}
            icon={<RefreshCw className="h-4 w-4" />}
            variant={isStale || !processed ? "primary" : "outline"}
          >
            {status === "processing"
              ? "Calculating…"
              : processed
                ? "Recalculate Nutrition"
                : "Calculate My Nutrition"}
          </Button>
          {processed && (
            <p className="text-xs text-muted">
              Calculated {formatDateTime(processed.processedAt)}
            </p>
          )}
        </div>
      </header>

      {/* ------------------------ stale warning ------------------------ */}
      {isStale && (
        <div
          role="status"
          className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-card border border-accent-300/40/30 bg-accent-200/30 p-4"
        >
          <div className="flex items-start gap-3">
            <TriangleAlert
              className="mt-0.5 h-4 w-4 shrink-0 text-accent-300"
              aria-hidden="true"
            />
            <p className="text-xs leading-relaxed text-ink/80">
              Your profile has changed since these results were calculated.
              Recalculate to bring your nutrition targets up to date.
            </p>
          </div>
          <Button size="sm" onClick={() => recalculate()} icon={<RefreshCw className="h-3.5 w-3.5" />}>
            Recalculate
          </Button>
        </div>
      )}

      {/* -------------------- missing information --------------------- */}
      {errors.length > 0 && (
        <Card className="mb-6 border-accent-300/40/30">
          <CardBody>
            <div className="flex items-center gap-2">
              <CircleAlert
                className="h-4 w-4 shrink-0 text-accent-300"
                aria-hidden="true"
              />
              <h2 className="text-sm font-bold text-ink">
                Your profile needs a few more details
              </h2>
            </div>
            <ul className="mt-3 space-y-1.5">
              {errors.map((issue) => (
                <li key={issue.field} className="flex gap-2 text-sm text-muted">
                  <span className="font-bold text-accent-300">·</span>
                  {issue.message}
                </li>
              ))}
            </ul>
            <div className="mt-4">
              <Button href="/planner" size="sm" icon={<ArrowRight className="h-3.5 w-3.5" />}>
                Complete Profile
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* --------------------------- results -------------------------- */}
      {!processed ? (
        <EmptyState
          icon={<Calculator className="h-6 w-6" aria-hidden="true" />}
          title="No results yet"
          description="Run the processing engine to calculate your BMI, estimated energy needs and macronutrient targets from your saved profile."
          action={
            <Button onClick={() => recalculate()} icon={<Calculator className="h-4 w-4" />}>
              Calculate My Nutrition
            </Button>
          }
        />
      ) : (
        <ResultsGrid processed={processed} showResults={showResults} />
      )}

      {processed && (
        <>
          <CalculationDetails processed={processed} />
          <p className="mt-6 rounded-card border border-line bg-surface p-4 text-xs leading-relaxed text-muted">
            <strong className="text-ink">Please note:</strong> calculated
            values are general estimates for educational planning and may not
            reflect individual nutritional needs. They are not a medical
            diagnosis or prescription. BMI is a general screening measure only.
          </p>
        </>
      )}

      {/* ----------------------- next step bridge ---------------------- */}
      <NextStepCard
        className="mt-6"
        hideWhen={["nutrition_missing", "nutrition_stale"]}
      />

      <Card className="mt-6">
        <CardBody className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-base font-bold text-ink">
              Next: your personalised diet plan
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Goal:{" "}
              <strong className="text-ink">
                {processed?.goal?.label ??
                  (profile.nutritionalInformation.primaryGoal ? "—" : "Not set")}
              </strong>
              . Your plan will use this goal and these targets as inputs when
              selecting meals in the next stage.
            </p>
          </div>
          <Button
            href="/diet-plan"
            variant="outline"
            icon={<ArrowRight className="h-4 w-4" />}
          >
            View Diet Plan Area
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Results grid                                                        */
/* ------------------------------------------------------------------ */

function ResultsGrid({
  processed,
  showResults,
}: {
  processed: ProcessedProfile;
  showResults: boolean;
}) {
  const { bmi, energy, macronutrients: macros } = processed;
  const proteinPercent = proteinPercentOfCalories(
    macros.protein.selectedGrams,
    energy.selectedCalories,
  );

  return (
    <div className="space-y-5">
      {!showResults && (
        <Badge tone="warning">
          <Info className="h-3 w-3" aria-hidden="true" />
          Partial results — some values could not be calculated
        </Badge>
      )}

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        {/* ------------------------- BMI card ------------------------- */}
        <Card>
          <div className="border-b border-line bg-brand-50/60 px-5 py-3.5">
            <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
              <Scale className="h-4 w-4 text-brand-400" aria-hidden="true" />
              Body Mass Index
            </h2>
          </div>
          <CardBody>
            {bmi ? (
              <>
                <p className="text-4xl font-extrabold tracking-tight text-ink">
                  {bmi.value.toFixed(1)}
                </p>
                <span
                  className={cn(
                    "mt-3 inline-block rounded-pill border px-3 py-1 text-xs font-bold",
                    BMI_TONE[bmi.category] ?? BMI_TONE.normal,
                  )}
                >
                  {bmi.categoryLabel}
                </span>
                <p className="mt-4 text-xs leading-relaxed text-muted">
                  BMI is a general screening measure and does not provide a
                  complete assessment of health.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted">
                BMI could not be calculated. A valid height and weight are
                required.
              </p>
            )}
          </CardBody>
        </Card>

        {/* ------------------------ Energy card ----------------------- */}
        <Card>
          <div className="border-b border-line bg-brand-50/60 px-5 py-3.5">
            <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
              <Flame className="h-4 w-4 text-brand-400" aria-hidden="true" />
              Energy Estimate
            </h2>
          </div>
          <CardBody>
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat
                label="Resting energy"
                value={formatNumber(energy.restingEstimateCalories)}
                unit="kcal/day"
              />
              <Stat
                label="Estimated maintenance"
                value={formatNumber(energy.maintenanceEstimateCalories)}
                unit="kcal/day"
              />
              <Stat
                label="Selected daily target"
                value={formatNumber(energy.selectedCalories)}
                unit="kcal/day"
                emphasis
              />
            </div>

            <div className="mt-4 rounded-[10px] bg-canvas p-3 text-xs leading-relaxed text-muted">
              {energy.selectedSource === "user" && (
                <>
                  You supplied a daily calorie target, so that value is being
                  used. The calculated estimate was{" "}
                  <strong className="text-ink">
                    {formatNumber(energy.calculatedGoalCalories)} kcal/day
                  </strong>
                  .
                </>
              )}
              {energy.selectedSource === "calculated" && (
                <>
                  Your daily target is an{" "}
                  <strong className="text-ink">estimate</strong> based on your
                  profile and selected goal. Enter your own target in step 2 to
                  override it.
                </>
              )}
              {energy.selectedSource === "unavailable" && (
                <>
                  A daily target could not be produced yet — please complete the
                  missing details listed above.
                </>
              )}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {processed.activity && (
                <Badge tone="neutral">
                  <Activity className="h-3 w-3" aria-hidden="true" />
                  {processed.activity.label}
                  {energy.activityFactor ? ` · ×${energy.activityFactor}` : ""}
                </Badge>
              )}
              {processed.goal && (
                <Badge tone="brand">
                  <Target className="h-3 w-3" aria-hidden="true" />
                  {processed.goal.label}
                </Badge>
              )}
              <Badge tone={energy.selectedSource === "user" ? "warning" : "neutral"}>
                <UserRound className="h-3 w-3" aria-hidden="true" />
                {energy.selectedSource === "user"
                  ? "User-provided target"
                  : "Calculated estimate"}
              </Badge>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* --------------------- Macronutrient cards -------------------- */}
      <Card>
        <div className="border-b border-line bg-brand-50/60 px-5 py-3.5">
          <h2 className="text-sm font-bold text-ink">
            Estimated Macronutrient Targets
          </h2>
        </div>
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-3">
            <MacroCard
              label="Protein"
              grams={macros.protein.selectedGrams}
              percent={proteinPercent}
              note={
                macros.protein.selectedSource === "user"
                  ? "Your own target"
                  : macros.protein.gramsPerKg
                    ? `${macros.protein.gramsPerKg} g per kg body weight`
                    : undefined
              }
            />
            <MacroCard
              label="Carbohydrates"
              grams={macros.carbohydrates.grams}
              percent={macros.carbohydrates.percentOfCalories}
              note="Remaining daily calories"
            />
            <MacroCard
              label="Fat"
              grams={macros.fat.grams}
              percent={macros.fat.percentOfCalories}
              note={`${Math.round(FAT_SHARE_OF_CALORIES * 100)}% of daily calories`}
            />
          </div>

          {/* Simple, honest macro bar — values are always shown as text too */}
          {proteinPercent !== null &&
            macros.carbohydrates.percentOfCalories !== null &&
            macros.fat.percentOfCalories !== null && (
              <div className="mt-5">
                <div
                  className="flex h-3 w-full overflow-hidden rounded-pill border border-line"
                  role="img"
                  aria-label={`Calorie split: protein ${proteinPercent}%, carbohydrates ${macros.carbohydrates.percentOfCalories}%, fat ${macros.fat.percentOfCalories}%`}
                >
                  <span
                    className="h-full bg-brand-700"
                    style={{ width: `${proteinPercent}%` }}
                  />
                  <span
                    className="h-full bg-brand-400"
                    style={{ width: `${macros.carbohydrates.percentOfCalories}%` }}
                  />
                  <span
                    className="h-full bg-accent-400"
                    style={{ width: `${macros.fat.percentOfCalories}%` }}
                  />
                </div>
                <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
                  <li className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-brand-700" aria-hidden="true" />
                    Protein {proteinPercent}%
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-brand-400" aria-hidden="true" />
                    Carbohydrates {macros.carbohydrates.percentOfCalories}%
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-accent-400" aria-hidden="true" />
                    Fat {macros.fat.percentOfCalories}%
                  </li>
                </ul>
              </div>
            )}

          {macros.totalMacroCalories !== null && energy.selectedCalories !== null && (
            <p className="mt-4 text-xs text-muted">
              Macronutrient calories add up to{" "}
              <strong className="text-ink">
                {formatNumber(macros.totalMacroCalories)} kcal
              </strong>{" "}
              against a target of{" "}
              <strong className="text-ink">
                {formatNumber(energy.selectedCalories)} kcal
              </strong>{" "}
              (small differences come from rounding).
            </p>
          )}
        </CardBody>
      </Card>

      {/* -------------------------- notes ---------------------------- */}
      {processed.calculationNotes.length > 0 && (
        <Card>
          <CardBody>
            <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
              <Info className="h-4 w-4 text-brand-400" aria-hidden="true" />
              Assumptions applied
            </h2>
            <ul className="mt-3 space-y-1.5">
              {processed.calculationNotes.map((note) => (
                <li key={note} className="flex gap-2 text-xs leading-relaxed text-muted">
                  <span className="font-bold text-brand-400">·</span>
                  {note}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  emphasis,
}: {
  label: string;
  value: string;
  unit: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[10px] border p-3.5",
        emphasis ? "border-brand-400/25 bg-brand-50" : "border-line bg-canvas",
      )}
    >
      <p className="text-xs font-medium text-muted">{label}</p>
      <p
        className={cn(
          "mt-1 font-extrabold tracking-tight text-ink",
          emphasis ? "text-2xl" : "text-xl",
        )}
      >
        {value}
      </p>
      <p className="text-xs text-muted">{unit}</p>
    </div>
  );
}

function MacroCard({
  label,
  grams,
  percent,
  note,
}: {
  label: string;
  grams: number | null;
  percent: number | null;
  note?: string;
}) {
  return (
    <div className="rounded-[10px] border border-line bg-canvas p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tracking-tight text-ink">
        {grams === null ? "—" : `${Math.round(grams)} g`}
      </p>
      <p className="text-xs text-muted">
        per day{percent !== null ? ` · ${percent}% of calories` : ""}
      </p>
      {note && <p className="mt-2 text-xs text-muted">{note}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Collapsible calculation details (great for the project viva)        */
/* ------------------------------------------------------------------ */

function CalculationDetails({ processed }: { processed: ProcessedProfile }) {
  const [open, setOpen] = useState(false);
  const { energy, macronutrients: macros } = processed;

  const formulaLabel =
    energy.formula === "mifflin_st_jeor_male"
      ? "Mifflin-St Jeor (male constant +5)"
      : energy.formula === "mifflin_st_jeor_female"
        ? "Mifflin-St Jeor (female constant −161)"
        : energy.formula === "mifflin_st_jeor_neutral"
          ? `Mifflin-St Jeor (neutral midpoint constant ${MIFFLIN.constantNeutral})`
          : "—";

  return (
    <Card className="mt-6">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="calculation-details"
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-brand-50/50 sm:px-7"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-ink">
          <Calculator className="h-4 w-4 text-brand-400" aria-hidden="true" />
          How was this calculated?
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div id="calculation-details" className="border-t border-line px-5 py-5 sm:px-7">
          <dl className="space-y-4">
            <DetailRow
              term="BMI"
              formula="weight (kg) ÷ height² (m)"
              detail="Height is stored in centimetres and converted to metres before the division."
            />
            <DetailRow
              term="Resting energy (BMR)"
              formula={`${MIFFLIN.weightFactor} × weight(kg) + ${MIFFLIN.heightFactor} × height(cm) − ${MIFFLIN.ageFactor} × age + c`}
              detail={`Formula used: ${formulaLabel}.`}
            />
            <DetailRow
              term="Maintenance energy"
              formula="resting energy × activity factor"
              detail={`Activity factors: ${Object.entries(ACTIVITY_FACTORS)
                .map(([key, factor]) => `${key.replace(/_/g, " ")} ${factor}`)
                .join(", ")}.`}
            />
            <DetailRow
              term="Goal target"
              formula="maintenance × (1 + goal adjustment)"
              detail={
                energy.goalAdjustment !== null
                  ? `Adjustment applied for your goal: ${
                      energy.goalAdjustment === 0
                        ? "none"
                        : `${energy.goalAdjustment > 0 ? "+" : ""}${Math.round(
                            energy.goalAdjustment * 100,
                          )}%`
                    }. The result is kept within the application's sensible calorie range.`
                  : "A goal adjustment could not be applied yet."
              }
            />
            <DetailRow
              term="Protein"
              formula="body weight (kg) × goal factor (g/kg)"
              detail={
                macros.protein.selectedSource === "user"
                  ? "You supplied your own protein target, so it is used instead of the estimate."
                  : macros.protein.gramsPerKg
                    ? `Factor used: ${macros.protein.gramsPerKg} g per kg.`
                    : "Requires a valid weight."
              }
            />
            <DetailRow
              term="Fat"
              formula={`(daily calories × ${FAT_SHARE_OF_CALORIES}) ÷ ${MACRO_CALORIES_PER_GRAM.fat}`}
              detail="Fat is allocated as a share of daily calories, then converted to grams."
            />
            <DetailRow
              term="Carbohydrates"
              formula={`(daily calories − protein kcal − fat kcal) ÷ ${MACRO_CALORIES_PER_GRAM.carbohydrate}`}
              detail={`Energy values used: protein ${MACRO_CALORIES_PER_GRAM.protein} kcal/g, carbohydrate ${MACRO_CALORIES_PER_GRAM.carbohydrate} kcal/g, fat ${MACRO_CALORIES_PER_GRAM.fat} kcal/g.`}
            />
            <DetailRow
              term="Target priority"
              formula="valid user-provided target → calculated estimate → none"
              detail="The application never invents a value when the required information is missing."
            />
          </dl>
        </div>
      )}
    </Card>
  );
}

function DetailRow({
  term,
  formula,
  detail,
}: {
  term: string;
  formula: string;
  detail: string;
}) {
  return (
    <div className="rounded-[10px] border border-line bg-canvas p-3.5">
      <dt className="text-xs font-bold uppercase tracking-wide text-brand-400">
        {term}
      </dt>
      <dd>
        <p className="mt-1 font-mono text-xs text-ink">{formula}</p>
        <p className="mt-1.5 text-xs leading-relaxed text-muted">{detail}</p>
      </dd>
    </div>
  );
}

/** Protected route: requires an authenticated session. */
export function NutritionDashboard() {
  return (
    <RequireAuth>
      <NutritionDashboardView />
    </RequireAuth>
  );
}
