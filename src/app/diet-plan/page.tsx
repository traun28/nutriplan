"use client";

import { RequireAuth } from "@/components/auth/RequireAuth";

/**
 * Part 8 — the personalised diet dashboard.
 *
 * PRESENTATION ONLY. It reads:
 *   userProfile      (Parts 2–5)
 *   processedProfile (Part 6 targets)
 *   dietPlan         (Part 7 generated + validated output)
 *
 * It never calculates nutrition and never generates meals — those calls
 * live in the contexts, which delegate to the Part 6/7 services.
 *
 * The primary action always reflects the next required step:
 *   no profile        → Create Profile
 *   no targets        → Calculate Nutrition
 *   targets, no plan  → Generate Diet Plan
 *   plan ready        → Regenerate Plan
 *   plan stale        → Generate New Plan
 */
import {
  AlertTriangle,
  ArrowRight,
  Calculator,
  CheckCircle2,
  ChevronDown,
  Loader2,
  PencilLine,
  Printer,
  RefreshCw,
  Salad,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useProfile } from "@/context/ProfileContext";
import { useNutrition } from "@/context/NutritionContext";
import { useDietPlan } from "@/context/DietPlanContext";
import { ACTIVITY_LEVELS, GENDER_OPTIONS, labelFor } from "@/data/options";
import { formatDateTime } from "@/lib/numbers";
import { Badge, Button, Card, CardBody, EmptyState } from "@/components/ui/core";
import { MealCard } from "@/components/diet-plan/MealCard";
import { SafetySummary } from "@/components/diet-plan/SafetySummary";
import { ConflictNotice } from "@/components/common/ConflictNotice";
import {
  DayAtAGlance,
  NutritionComparison,
} from "@/components/diet-plan/NutritionComparison";
import {
  DietaryConsiderationsCard,
  PersonalisationCard,
  PlanConsiderationsCard,
  RecommendationsCard,
} from "@/components/diet-plan/PlanAside";
import { cn } from "@/lib/cn";

function DietPlanView() {
  const { profile, hydrated, completion } = useProfile();
  const { processed, isStale: targetsStale, recalculate } = useNutrition();
  const {
    plan,
    status,
    failure,
    isStale: planStale,
    justRegenerated,
    generate,
    regenerate,
  } = useDietPlan();

  /* ----------------------------- loading ------------------------------ */
  if (!hydrated) {
    return (
      <div className="page-container page-section">
        <header className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-400">
            Your results
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            Your Personalised Diet Plan
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Loading your plan…
          </p>
        </header>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
          <div className="h-56 animate-pulse rounded-card bg-line/40" />
          <div className="h-72 animate-pulse rounded-card bg-line/30" />
        </div>
      </div>
    );
  }

  /* ------------------------- profile incomplete ----------------------- */
  if (!completion.personalComplete || !completion.nutritionComplete) {
    return (
      <Shell>
        <EmptyState
          icon={<Salad className="h-6 w-6" aria-hidden="true" />}
          title="No personalised diet plan yet"
          description="Complete your profile and generate your plan to see your meals here."
          action={
            <Button href="/planner" icon={<ArrowRight className="h-4 w-4" />}>
              Create My Plan
            </Button>
          }
        />
      </Shell>
    );
  }

  /* ------------------------- targets missing -------------------------- */
  if (!processed || processed.status !== "complete") {
    return (
      <Shell>
        <EmptyState
          icon={<Calculator className="h-6 w-6" aria-hidden="true" />}
          title="Your nutrition targets are not ready"
          description="Your meal plan is built from your calculated calorie and macronutrient targets. Calculate them first."
          action={
            <Button href="/nutrition" icon={<ArrowRight className="h-4 w-4" />}>
              Calculate Nutrition
            </Button>
          }
        />
      </Shell>
    );
  }

  /* ---------------------------- generating ---------------------------- */
  if (status === "generating") {
    return (
      <Shell>
        <div className="flex flex-col items-center rounded-card border border-line bg-surface px-6 py-16 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-400" aria-hidden="true" />
          <p className="mt-4 text-base font-bold text-ink" role="status">
            Creating your personalised plan…
          </p>
          <p className="mt-1 text-sm text-muted">
            Checking your dietary restrictions and balancing your meals.
          </p>
        </div>
      </Shell>
    );
  }

  /* ------------------------------ error ------------------------------- */
  if (status === "error" && failure) {
    return (
      <Shell>
        <Card className="border-danger-500/30">
          <CardBody>
            <div className="flex items-start gap-3">
              <AlertTriangle
                className="mt-0.5 h-6 w-6 shrink-0 text-danger-600"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-ink">
                  We couldn&rsquo;t create a suitable plan
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                  {failure.message}
                </p>
                {failure.details.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {failure.details.map((detail) => (
                      <li key={detail} className="flex gap-2 text-xs text-muted">
                        <span className="font-bold text-danger-600">·</span>
                        {detail}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-5 flex flex-wrap gap-3">
                  <Button href="/planner?step=2" icon={<PencilLine className="h-4 w-4" />}>
                    Review Preferences
                  </Button>
                  <Button variant="outline" onClick={() => generate()} icon={<RefreshCw className="h-4 w-4" />}>
                    Try Again
                  </Button>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      </Shell>
    );
  }

  /* ----------------------------- no plan ------------------------------ */
  if (!plan) {
    return (
      <Shell>
        <EmptyState
          icon={<Sparkles className="h-6 w-6" aria-hidden="true" />}
          title="Your targets are ready — let's build your plan"
          description="Generate a daily meal plan built around your goal, dietary pattern, restrictions and preferences."
          action={
            <Button onClick={() => generate()} icon={<Sparkles className="h-4 w-4" />}>
              Generate My Diet Plan
            </Button>
          }
        />
      </Shell>
    );
  }

  /* ------------------------------ ready ------------------------------- */
  const firstName = profile.personalDetails.fullName.trim().split(" ")[0];
  const needsNewPlan = planStale || targetsStale;

  return (
    <div className="page-container page-section print:max-w-none print:px-0 print:py-0">
      {/* Print-only document header */}
      <div className="hidden print:mb-6 print:block">
        <h1 className="text-xl font-bold">PERSONALISED DIET PLAN</h1>
        <p className="text-sm">
          User: {profile.personalDetails.fullName.trim() || "—"} · Generated:{" "}
          {formatDateTime(plan.generatedAt)}
        </p>
      </div>

      {/* -------------------------- page header -------------------------- */}
      <header className="mb-6 print:hidden">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-400">
          Your results
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          Your Personalised Diet Plan
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
          Here&rsquo;s a daily meal plan built around your goals, dietary
          preferences and nutritional profile.
        </p>
      </header>

      {/* --------------------------- status bar -------------------------- */}
      <div
        className={cn(
          "mb-6 flex flex-col gap-4 rounded-card border p-5 sm:flex-row sm:items-center sm:justify-between print:hidden",
          needsNewPlan
            ? "border-accent-300/40/30 bg-accent-200/30"
            : "border-brand-400/25 bg-brand-50/70",
        )}
      >
        <div className="flex items-start gap-3">
          {needsNewPlan ? (
            <TriangleAlert
              className="mt-0.5 h-5 w-5 shrink-0 text-accent-300"
              aria-hidden="true"
            />
          ) : (
            <CheckCircle2
              className="mt-0.5 h-5 w-5 shrink-0 text-brand-400"
              aria-hidden="true"
            />
          )}
          <div>
            <p className="text-sm font-bold text-ink" role="status">
              {needsNewPlan ? "Your profile has changed" : "Your plan is ready"}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              {needsNewPlan
                ? "This plan was generated using an older profile. Generate a new plan to use your latest information."
                : `Generated from your latest saved profile on ${formatDateTime(
                    plan.generatedAt,
                  )}.`}
            </p>
            {justRegenerated && !needsNewPlan && (
              <p className="mt-1 text-xs font-semibold text-brand-400">
                New meal plan generated with alternative choices.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2.5">
          {needsNewPlan ? (
            <Button
              onClick={async () => {
                if (targetsStale) {
                  const fresh = await recalculate();
                  if (fresh) generate({ profile, processed: fresh });
                  return;
                }
                generate();
              }}
              icon={<RefreshCw className="h-4 w-4" />}
            >
              Generate New Plan
            </Button>
          ) : (
            <Button onClick={regenerate} icon={<RefreshCw className="h-4 w-4" />}>
              Regenerate Plan
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => window.print()}
            icon={<Printer className="h-4 w-4" />}
          >
            Print Diet Plan
          </Button>
          <Button
            href="/dashboard"
            variant="ghost"
            icon={<ArrowRight className="h-4 w-4" />}
          >
            Track Today
          </Button>
          <Button
            href="/planner?step=1"
            variant="ghost"
            icon={<PencilLine className="h-4 w-4" />}
          >
            Edit Profile
          </Button>
        </div>
      </div>

      {/* ------------------------ profile summary ------------------------ */}
      <ProfileStrip firstName={firstName} />

      {/* ------------------------ day at a glance ------------------------ */}
      <section className="mt-6" aria-labelledby="glance-heading">
        <h2
          id="glance-heading"
          className="mb-3 text-sm font-bold uppercase tracking-wide text-muted"
        >
          Your day at a glance
        </h2>
        <DayAtAGlance plan={plan} />
      </section>

      {/* --------------------------- main grid --------------------------- */}
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Meal plan */}
        <section aria-labelledby="meals-heading">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="meals-heading" className="text-sm font-bold uppercase tracking-wide text-muted">
              Daily meal plan
            </h2>
            <span className="text-xs text-muted">
              {plan.meals.length} meals · {plan.dailyTotals.calories.toLocaleString()} kcal planned
            </span>
          </div>
          <div className="space-y-4">
            {plan.meals.map((meal, index) => (
              <MealCard key={meal.id} meal={meal} index={index} />
            ))}
          </div>

          {plan.validation.warnings.length > 0 && (
            <div className="mt-4 rounded-card border border-accent-300/40/30 bg-accent-200/30 p-4">
              <p className="text-xs font-bold text-ink">Notes about this plan</p>
              <ul className="mt-2 space-y-1">
                {plan.validation.warnings.map((warning) => (
                  <li key={warning} className="text-xs leading-relaxed text-ink/80">
                    · {warning}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Supporting column */}
        <div className="space-y-4">
          <NutritionComparison plan={plan} />
          <SafetySummary plan={plan} />
          <DietaryConsiderationsCard profile={profile} />
          <PlanConsiderationsCard profile={profile} />
        </div>
      </div>

      <ConflictNotice className="mt-6" />

      {/* ------------------ personalisation + guidance ------------------- */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <PersonalisationCard plan={plan} />
        <RecommendationsCard plan={plan} />
      </div>

      {/* ------------------------- plan metadata ------------------------- */}
      <Card className="mt-6 break-inside-avoid">
        <CardBody className="flex flex-wrap items-center justify-between gap-4">
          <dl className="flex flex-wrap gap-x-8 gap-y-2 text-xs">
            <div>
              <dt className="text-muted">Meals</dt>
              <dd className="font-bold text-ink">{plan.meals.length}</dd>
            </div>
            <div>
              <dt className="text-muted">Planned calories</dt>
              <dd className="font-bold text-ink">
                {plan.dailyTotals.calories.toLocaleString()} kcal
              </dd>
            </div>
            <div>
              <dt className="text-muted">Goal</dt>
              <dd className="font-bold text-ink">{plan.summary.goal?.label ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted">Generated</dt>
              <dd className="font-bold text-ink">{formatDateTime(plan.generatedAt)}</dd>
            </div>
          </dl>
          <Badge tone="brand" className="print:hidden">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            Plan saved on this device
          </Badge>
        </CardBody>
      </Card>

      {/* --------------------------- disclaimer -------------------------- */}
      <p className="mt-6 rounded-card border border-line bg-surface p-4 text-xs leading-relaxed text-muted">
        <strong className="text-ink">Please note:</strong> nutrition values and
        meal suggestions are general estimates for educational planning and may
        vary based on preparation, portion size, ingredients and individual
        needs. This tool is not a substitute for advice from a qualified
        healthcare or nutrition professional.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shell used by every non-ready state                                 */
/* ------------------------------------------------------------------ */

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="page-container page-section max-w-3xl">
      <header className="mb-8 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-400">
          Your results
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          Your Personalised Diet Plan
        </h1>
      </header>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Compact profile strip with an expandable full summary               */
/* ------------------------------------------------------------------ */

function ProfileStrip({ firstName }: { firstName: string }) {
  const { profile } = useProfile();
  const { processed } = useNutrition();
  const [open, setOpen] = useState(false);
  const pd = profile.personalDetails;

  const chips = [
    { label: "Goal", value: processed?.goal?.label ?? "—" },
    {
      label: "Diet",
      value:
        profile.dietaryPreferences.dietaryType
          ? profile.dietaryPreferences.dietaryType
              .replace(/_/g, "-")
              .replace(/\b\w/g, (c) => c.toUpperCase())
          : "—",
    },
    {
      label: "Activity",
      value: pd.activityLevel ? labelFor(ACTIVITY_LEVELS, pd.activityLevel) : "—",
    },
    {
      label: "BMI",
      value: processed?.bmi ? `${processed.bmi.value.toFixed(1)}` : "—",
    },
  ];

  return (
    <Card className="break-inside-avoid">
      <CardBody className="py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <p className="text-base font-bold text-ink">
              {firstName ? `Hi, ${firstName}` : "Your profile"}
            </p>
            <dl className="flex flex-wrap gap-x-6 gap-y-2">
              {chips.map((chip) => (
                <div key={chip.label}>
                  <dt className="text-[11px] font-medium text-muted">{chip.label}</dt>
                  <dd className="text-sm font-bold text-ink">{chip.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="profile-summary-details"
            className="print:hidden inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-brand-400/50 hover:text-brand-400"
          >
            {open ? "Hide profile summary" : "View profile summary"}
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")}
              aria-hidden="true"
            />
          </button>
        </div>

        {open && (
          <dl
            id="profile-summary-details"
            className="mt-4 grid gap-x-6 gap-y-3 border-t border-line pt-4 sm:grid-cols-3"
          >
            <Detail label="Age" value={pd.age !== null ? `${pd.age} years` : "—"} />
            <Detail
              label="Gender"
              value={pd.gender ? labelFor(GENDER_OPTIONS, pd.gender) : "—"}
            />
            <Detail
              label="Height"
              value={pd.heightCm !== null ? `${pd.heightCm} cm` : "—"}
            />
            <Detail
              label="Weight"
              value={pd.weightKg !== null ? `${pd.weightKg} kg` : "—"}
            />
            <Detail
              label="Preferred cuisines"
              value={
                profile.dietaryPreferences.preferredCuisines.length > 0
                  ? profile.dietaryPreferences.preferredCuisines
                      .map((c) => c.replace(/_/g, " "))
                      .join(", ")
                  : "—"
              }
            />
            <Detail
              label="Daily energy target"
              value={
                processed?.energy.selectedCalories !== null &&
                processed?.energy.selectedCalories !== undefined
                  ? `${processed.energy.selectedCalories.toLocaleString()} kcal`
                  : "—"
              }
            />
          </dl>
        )}
      </CardBody>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium text-muted">{label}</dt>
      <dd className="text-sm font-semibold capitalize text-ink">{value}</dd>
    </div>
  );
}

/** Protected route: requires an authenticated session. */
export default function DietPlanPage() {
  return (
    <RequireAuth>
      <DietPlanView />
    </RequireAuth>
  );
}
