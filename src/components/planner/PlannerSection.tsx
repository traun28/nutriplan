"use client";

/**
 * PlannerSection — consistent shell for every questionnaire step.
 *
 * Every step gets: section label ("Step 1 of 5"), title, explanation,
 * content area and a footer with Back / Continue. An optional aside
 * column (e.g. live summary) appears on wide screens.
 */
import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Card, CardBody } from "@/components/ui/core";
import { Button } from "@/components/ui/core";

interface PlannerSectionProps {
  stepLabel: string;
  title: string;
  description: string;
  children: ReactNode;
  onBack?: () => void;
  onContinue?: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
  /** Shown next to a disabled Continue button to explain why. */
  continueHint?: string;
  aside?: ReactNode;
  continueIcon?: ReactNode;
}

export function PlannerSection({
  stepLabel,
  title,
  description,
  children,
  onBack,
  onContinue,
  continueLabel = "Continue",
  continueDisabled = false,
  continueHint,
  aside,
  continueIcon,
}: PlannerSectionProps) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardBody>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-400">
            {stepLabel}
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink">
            {title}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            {description}
          </p>

          <div className="mt-8 space-y-8">{children}</div>

          <div className="mt-10 flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {onBack && (
                <Button
                  variant="ghost"
                  onClick={onBack}
                  icon={<ArrowLeft className="h-4 w-4" />}
                >
                  Back
                </Button>
              )}
            </div>
            <div className="flex flex-col items-start gap-2 sm:items-end">
              {continueDisabled && continueHint && (
                <p className="text-xs font-medium text-accent-300">
                  {continueHint}
                </p>
              )}
              {onContinue && (
                <Button
                  onClick={onContinue}
                  disabled={continueDisabled}
                  icon={continueIcon ?? <ArrowRight className="h-4 w-4" />}
                >
                  {continueLabel}
                </Button>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      {aside && <aside className="lg:sticky lg:top-24">{aside}</aside>}
    </div>
  );
}
