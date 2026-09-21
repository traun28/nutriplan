"use client";

import { RequireAuth } from "@/components/auth/RequireAuth";

/**
 * Review page — every profile section in one place, with Edit actions and
 * the primary "Save My Profile" action (Part 5).
 *
 * All values come from the central profile state and are rendered through
 * the shared summary cards, so raw JSON is never shown to the user.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Circle,
  Sparkles,
  PencilLine,
  Save,
  TriangleAlert,
} from "lucide-react";
import type { ReactNode } from "react";
import { useProfile } from "@/context/ProfileContext";
import { useNutrition } from "@/context/NutritionContext";
import { useDietPlan } from "@/context/DietPlanContext";
import { PLANNER_STEPS } from "@/data/options";
import { validateCompleteProfile } from "@/lib/validation";
import { formatDateTime } from "@/lib/numbers";
import { ProgressSteps } from "@/components/ui/ProgressSteps";
import { ConflictNotice } from "@/components/common/ConflictNotice";
import { Badge, Button, Card, CardBody, EmptyState } from "@/components/ui/core";
import {
  FoodIntakeSummary,
  MealHabitsSummary,
  MealTimingsSummary,
  NutritionSummaryCard,
  PersonalDetailsSummary,
  PracticalConstraintsSummary,
  PreferencesSummary,
} from "@/components/review/SummaryCards";

function ReviewBlock({
  title,
  editHref,
  children,
}: {
  title: string;
  editHref: string;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <div className="absolute right-4 top-3 z-10">
        <Link
          href={editHref}
          className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-white px-3 py-1 text-xs font-semibold text-ink shadow-sm transition-colors hover:border-brand-300 hover:text-brand-700"
        >
          <PencilLine className="h-3 w-3" aria-hidden="true" />
          Edit
          <span className="sr-only"> {title}</span>
        </Link>
      </div>
      {children}
    </div>
  );
}

function ReviewView() {
  const router = useRouter();
  const {
    profile,
    hydrated,
    completion,
    hasSavedProfile,
    hasUnsavedChanges,
    saveStatus,
    saveError,
    saveProfile,
    storageStatus,
  } = useProfile();
  const { recalculate } = useNutrition();
  const { generate } = useDietPlan();

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-10 sm:py-14">
        <header className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-600">
            Step 5 of 5 · Review
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            Review Your Information
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Loading your saved information…
          </p>
        </header>
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="h-48 animate-pulse rounded-card bg-line/40" />
          <div className="h-48 animate-pulse rounded-card bg-line/40" />
          <div className="h-48 animate-pulse rounded-card bg-line/30" />
          <div className="h-48 animate-pulse rounded-card bg-line/30" />
        </div>
      </div>
    );
  }

  const issues = validateCompleteProfile(profile);
  const readyToSave = issues.length === 0;
  const completedCount = completion.personalComplete
    ? completion.nutritionComplete
      ? completion.foodIntakeComplete
        ? 4
        : 3
      : 1
    : 0;

  const handleSave = async () => {
    const saved = await saveProfile();
    // Keep derived nutrition results in step with the newly saved revision.
    if (saved) void recalculate(saved);
  };

  /**
   * Explicit user action: save, recalculate targets, then generate.
   * Generation is never triggered automatically.
   */
  const handleSaveAndGenerate = async () => {
    const saved = await saveProfile();
    if (!saved) return;
    const processedNow = await recalculate(saved);
    if (processedNow) generate({ profile: saved, processed: processedNow });
    router.push("/diet-plan");
  };

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:py-14">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-600">
            Step 5 of 5 · Review
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            Review Your Information
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
            Everything you have entered, in one place. Edit any section, then
            save your profile when you are happy with it.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          {hasSavedProfile ? (
            hasUnsavedChanges ? (
              <Badge tone="warning">
                <TriangleAlert className="h-3 w-3" aria-hidden="true" />
                Unsaved changes
              </Badge>
            ) : (
              <Badge tone="brand">
                <Check className="h-3 w-3" aria-hidden="true" />
                Profile saved
              </Badge>
            )
          ) : (
            <Badge tone="neutral">Profile not saved yet</Badge>
          )}
          {profile.updatedAt && (
            <p className="text-xs text-muted">
              Last saved {formatDateTime(profile.updatedAt)}
            </p>
          )}
        </div>
      </header>

      <ProgressSteps
        steps={PLANNER_STEPS}
        activeIndexes={[4]}
        completedCount={completedCount}
        className="mb-10"
      />

      {storageStatus === "unavailable" && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-3 rounded-card border border-accent-300/70 bg-accent-200/30 p-4"
        >
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-accent-600"
            aria-hidden="true"
          />
          <p className="text-xs leading-relaxed text-ink/80">
            Browser storage is not available in this environment, so your
            profile cannot be saved between visits. You can still complete and
            review everything in this session.
          </p>
        </div>
      )}

      <ConflictNotice className="mb-6" />

      <div className="grid gap-5 lg:grid-cols-2">
        <ReviewBlock title="personal information" editHref="/planner?step=1">
          {completion.personalComplete ? (
            <PersonalDetailsSummary details={profile.personalDetails} />
          ) : (
            <Card className="h-full">
              <CardBody>
                <EmptyState
                  icon={<Circle className="h-5 w-5" aria-hidden="true" />}
                  title="Personal details not completed"
                  description="Your name, age, body measurements and activity level will appear here."
                  action={
                    <Button href="/planner?step=1" size="sm">
                      Complete step 1
                    </Button>
                  }
                />
              </CardBody>
            </Card>
          )}
        </ReviewBlock>

        <ReviewBlock title="nutrition information" editHref="/planner?step=2">
          {completion.nutritionComplete ? (
            <NutritionSummaryCard nutrition={profile.nutritionalInformation} />
          ) : (
            <Card className="h-full">
              <CardBody>
                <EmptyState
                  icon={<Circle className="h-5 w-5" aria-hidden="true" />}
                  title="Nutrition goals not completed"
                  description="Your main goal and optional targets will appear here."
                  action={
                    <Button href="/planner?step=2" size="sm">
                      Complete step 2
                    </Button>
                  }
                />
              </CardBody>
            </Card>
          )}
        </ReviewBlock>

        <ReviewBlock title="dietary preferences" editHref="/planner?step=2">
          <PreferencesSummary
            preferences={profile.dietaryPreferences}
            allergies={profile.allergies}
            intolerances={profile.intolerances}
            preferredFoods={profile.preferredFoods}
            foodsToAvoid={profile.foodsToAvoid}
          />
        </ReviewBlock>

        <ReviewBlock title="food intake" editHref="/planner?step=3">
          <FoodIntakeSummary intake={profile.foodIntake} />
        </ReviewBlock>

        <ReviewBlock title="meal timings" editHref="/planner?step=3">
          <MealTimingsSummary timings={profile.mealTimings} />
        </ReviewBlock>

        <ReviewBlock title="meal habits and hydration" editHref="/planner?step=3">
          <MealHabitsSummary
            habits={profile.mealHabits}
            water={profile.waterIntake}
          />
        </ReviewBlock>

        <div className="lg:col-span-2">
          <ReviewBlock title="practical information" editHref="/planner?step=3">
            <PracticalConstraintsSummary
              constraints={profile.practicalConstraints}
              additionalInformation={profile.additionalInformation}
            />
          </ReviewBlock>
        </div>
      </div>

      {/* ----------------------- Outstanding issues ---------------------- */}
      {issues.length > 0 && (
        <Card className="mt-8 border-accent-300/70">
          <CardBody>
            <div className="flex items-center gap-2">
              <TriangleAlert
                className="h-4 w-4 shrink-0 text-accent-600"
                aria-hidden="true"
              />
              <h2 className="text-sm font-bold text-ink">
                A few details are still needed before saving
              </h2>
            </div>
            <ul className="mt-3 space-y-2">
              {issues.map((issue) => (
                <li
                  key={`${issue.section}-${issue.field}-${issue.message}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-line bg-canvas px-3.5 py-2.5"
                >
                  <span className="text-sm text-ink">{issue.message}</span>
                  <Link
                    href={`/planner?step=${issue.step}`}
                    className="text-xs font-semibold text-brand-700 underline-offset-2 hover:underline"
                  >
                    Fix this
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {/* --------------------------- Save panel -------------------------- */}
      <Card className="mt-8 overflow-hidden">
        <div className="flex flex-col items-start justify-between gap-5 bg-brand-50/60 px-6 py-6 sm:flex-row sm:items-center sm:px-8">
          <div className="flex items-start gap-3">
            {readyToSave ? (
              <CheckCircle2
                className="mt-0.5 h-6 w-6 shrink-0 text-brand-600"
                aria-hidden="true"
              />
            ) : (
              <Circle className="mt-0.5 h-6 w-6 shrink-0 text-muted" aria-hidden="true" />
            )}
            <div>
              <h2 className="text-lg font-bold text-ink">
                {hasSavedProfile ? "Save your changes" : "Save your profile"}
              </h2>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted">
                {readyToSave
                  ? "Your information will be recorded on this device so you can return to it, edit it and use it for your nutrition calculations."
                  : "Complete the outstanding details above to record your profile."}
              </p>
              {saveStatus === "saved" && (
                <p
                  role="status"
                  className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700"
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Your profile has been saved on this device.
                </p>
              )}
              {saveStatus === "error" && saveError && (
                <p
                  role="alert"
                  className="mt-2 inline-flex items-start gap-1.5 text-sm font-semibold text-danger-600"
                >
                  <AlertTriangle
                    className="mt-0.5 h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                  <span>
                    {saveError} Your information is still available on this
                    page.
                  </span>
                </p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <Button
              onClick={handleSave}
              disabled={!readyToSave || saveStatus === "saving"}
              loading={saveStatus === "saving"}
              icon={<Save className="h-4 w-4" />}
            >
              {saveStatus === "saving"
                ? "Saving…"
                : hasSavedProfile
                  ? "Save Changes"
                  : "Save My Profile"}
            </Button>
            <Button
              onClick={handleSaveAndGenerate}
              disabled={!readyToSave || saveStatus === "saving"}
              variant="outline"
              icon={<Sparkles className="h-4 w-4" />}
            >
              Generate My Diet Plan
            </Button>
          </div>
        </div>
        <div className="border-t border-line px-6 py-3 sm:px-8">
          <p className="text-xs text-muted">
            Your profile is stored locally in this browser. It is never sent to
            any external service.
          </p>
        </div>
      </Card>
    </div>
  );
}

/** Protected route: requires an authenticated session. */
export default function ReviewPage() {
  return (
    <RequireAuth>
      <ReviewView />
    </RequireAuth>
  );
}
