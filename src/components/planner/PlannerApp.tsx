"use client";

/**
 * PlannerApp — the Diet Planner page shell.
 *
 * Owns the current questionnaire section and reflects it in the URL
 * (?step=1..4) so Edit links, back/forward and refresh all behave.
 * The 5-item progress indicator is driven by real validation state,
 * never by "visited" flags.
 */
import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useProfile } from "@/context/ProfileContext";
import { PLANNER_STEPS } from "@/data/options";
import { ProgressSteps } from "@/components/ui/ProgressSteps";
import { PersonalDetailsStep } from "@/components/planner/PersonalDetailsStep";
import { NutritionPreferencesStep } from "@/components/planner/NutritionPreferencesStep";
import { FoodIntakeStep } from "@/components/planner/FoodIntakeStep";
import { ReviewStep } from "@/components/planner/ReviewStep";
import { useUnsavedChangesWarning } from "@/hooks/useUnsavedChangesWarning";

const SECTION_COUNT = 4;

function sectionFromParam(step: string | null): number {
  if (!step) return 0;
  const parsed = Number(step);
  if (Number.isInteger(parsed) && parsed >= 1 && parsed <= SECTION_COUNT) {
    return parsed - 1;
  }
  return 0;
}

/** Active progress steps per section (Part 3 covers steps 2 AND 3). */
const ACTIVE_STEPS: number[][] = [
  [0],
  [1, 2],
  [3],
  [4],
];

export default function PlannerApp() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { completion, hasUnsavedChanges } = useProfile();

  useUnsavedChangesWarning(hasUnsavedChanges);

  // The URL is the source of truth, so browser navigation cannot drift from
  // the rendered questionnaire section.
  const section = sectionFromParam(searchParams.get("step"));

  const goTo = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(SECTION_COUNT - 1, next));
      router.replace(`${pathname}?step=${clamped + 1}`, { scroll: false });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [pathname, router],
  );

  // Steps 1..N count as complete only when their data validates.
  // Part 3 fills progress steps 2 AND 3, so completing it advances by two.
  const completedCount = completion.personalComplete
    ? completion.nutritionComplete
      ? completion.foodIntakeComplete
        ? 4
        : 3
      : 1
    : 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="mb-8">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-400">
          Diet Planner
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          Your Personalised Questionnaire
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
          Answer each section at your own pace. Your answers are saved as you
          go, survive navigation, and can be edited any time before your plan
          is generated.
        </p>
      </header>

      <ProgressSteps
        steps={PLANNER_STEPS}
        activeIndexes={ACTIVE_STEPS[section] ?? [0]}
        completedCount={completedCount}
        className="mb-10"
      />

      {section === 0 && <PersonalDetailsStep onContinue={() => goTo(1)} />}
      {section === 1 && (
        <NutritionPreferencesStep
          onBack={() => goTo(0)}
          onContinue={() => goTo(2)}
        />
      )}
      {section === 2 && (
        <FoodIntakeStep
          onBack={() => goTo(1)}
          onContinue={() => goTo(3)}
        />
      )}
      {section === 3 && <ReviewStep onBack={() => goTo(2)} />}
    </div>
  );
}
