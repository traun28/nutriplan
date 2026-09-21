"use client";

/**
 * Part 9 — the single source of "what should I do next?".
 *
 * Driven entirely by the application state machine (lib/appStatus.ts), so
 * every page shows the same, non-contradictory primary action. Status is
 * communicated by icon + text as well as colour.
 */
import {
  AlertTriangle,
  ArrowRight,
  Calculator,
  CheckCircle2,
  Info,
  Sparkles,
} from "lucide-react";
import { useNutrition } from "@/context/NutritionContext";
import { useDietPlan } from "@/context/DietPlanContext";
import { useAppStatus } from "@/hooks/useAppStatus";
import type { AppStatus } from "@/lib/appStatus";
import { Button, Card, CardBody } from "@/components/ui/core";
import { cn } from "@/lib/cn";

function StatusIcon({ status }: { status: AppStatus }) {
  if (status.needsAttention) {
    return (
      <AlertTriangle
        className="mt-0.5 h-5 w-5 shrink-0 text-accent-600"
        aria-hidden="true"
      />
    );
  }
  if (status.state === "plan_ready") {
    return (
      <CheckCircle2
        className="mt-0.5 h-5 w-5 shrink-0 text-brand-600"
        aria-hidden="true"
      />
    );
  }
  return (
    <Info className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
  );
}

function actionIcon(kind: AppStatus["action"]["kind"]) {
  if (kind === "calculate") return <Calculator className="h-4 w-4" />;
  if (kind === "generate") return <Sparkles className="h-4 w-4" />;
  return <ArrowRight className="h-4 w-4" />;
}

export function NextStepCard({
  className,
  /** Hide when the app is already in this state (avoids self-referential CTAs). */
  hideWhen = [],
}: {
  className?: string;
  hideWhen?: AppStatus["state"][];
}) {
  const status = useAppStatus();
  const { recalculate, status: nutritionStatus } = useNutrition();
  const { generate, status: planStatus } = useDietPlan();

  if (hideWhen.includes(status.state)) return null;

  const busy =
    (status.action.kind === "calculate" && nutritionStatus === "processing") ||
    (status.action.kind === "generate" && planStatus === "generating");

  const runAction = () => {
    if (status.action.kind === "calculate") void recalculate();
    if (status.action.kind === "generate") void generate();
  };

  return (
    <Card
      className={cn(
        status.needsAttention
          ? "border-accent-300/70 bg-accent-200/20"
          : "border-brand-200 bg-brand-50/60",
        className,
      )}
    >
      <CardBody className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <StatusIcon status={status} />
          <div className="min-w-0">
            <p className="text-sm font-bold text-ink">{status.title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              {status.description}
            </p>
          </div>
        </div>

        <div className="shrink-0">
          {status.action.href ? (
            <Button href={status.action.href} icon={actionIcon(status.action.kind)}>
              {status.action.label}
            </Button>
          ) : (
            <Button
              onClick={runAction}
              loading={busy}
              disabled={busy}
              icon={actionIcon(status.action.kind)}
            >
              {busy ? "Working…" : status.action.label}
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
