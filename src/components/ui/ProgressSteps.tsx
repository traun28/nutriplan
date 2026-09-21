"use client";

/**
 * ProgressSteps — questionnaire progress indicator.
 *
 * `completedCount` steps show a check; `activeIndexes` are highlighted;
 * the rest remain upcoming. The component never claims a step is
 * completed on its own — completion is derived from real validation.
 */
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ProgressStep } from "@/data/options";

interface ProgressStepsProps {
  steps: ProgressStep[];
  /** Zero-based indexes currently in progress (a range is allowed). */
  activeIndexes: number[];
  /** Number of steps from the start that are complete. */
  completedCount: number;
  className?: string;
}

export function ProgressSteps({
  steps,
  activeIndexes,
  completedCount,
  className,
}: ProgressStepsProps) {
  return (
    <nav aria-label="Questionnaire progress" className={className}>
      <ol className="flex w-full items-start">
        {steps.map((step, index) => {
          const complete = index < completedCount;
          const active = activeIndexes.includes(index);
          const nextActive = activeIndexes.includes(index + 1);
          const connectorState = complete
            ? "complete"
            : active && nextActive
              ? "active"
              : "upcoming";

          return (
            <li key={step.id} className="relative min-w-0 flex-1">
              <div className="flex flex-col items-center px-1 text-center">
                <span
                  className={cn(
                    "z-10 grid h-8 w-8 place-items-center rounded-full text-xs font-bold transition-colors duration-300",
                    complete && "bg-brand-700 text-white",
                    active &&
                      !complete &&
                      "border-2 border-brand-600 bg-surface text-brand-400 ring-4 ring-brand-500/15",
                    !complete &&
                      !active &&
                      "border-2 border-line bg-surface text-muted",
                  )}
                >
                  {complete ? (
                    <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span
                  className={cn(
                    "mt-2 hidden max-w-full truncate text-[11px] font-semibold sm:block",
                    complete || active ? "text-ink" : "text-muted",
                  )}
                >
                  {step.label}
                </span>
                <span
                  className={cn(
                    "mt-2 max-w-full truncate text-[10px] font-semibold sm:hidden",
                    complete || active ? "text-ink" : "text-muted",
                  )}
                >
                  {step.shortLabel ?? step.label}
                </span>
              </div>

              {index < steps.length - 1 && (
                <div
                  aria-hidden="true"
                  className="absolute left-1/2 top-4 h-0.5 w-full bg-line"
                >
                  <div
                    className={cn(
                      "h-full transition-colors duration-500",
                      connectorState !== "upcoming"
                        ? "bg-brand-500"
                        : "bg-transparent",
                    )}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
