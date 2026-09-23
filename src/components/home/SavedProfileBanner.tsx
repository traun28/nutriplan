"use client";

/**
 * Home-page "welcome back" strip (Part 5, refined in Part 9).
 *
 * The action shown here comes from the shared application state machine,
 * so the home page never suggests a step that conflicts with the one the
 * Review / Nutrition / Diet Plan pages are showing.
 *
 * Renders nothing for first-time visitors, keeping the hero uncluttered.
 */
import { ArrowRight, CheckCircle2, TriangleAlert } from "lucide-react";
import { useProfile } from "@/context/ProfileContext";
import { useNutrition } from "@/context/NutritionContext";
import { useDietPlan } from "@/context/DietPlanContext";
import { useAppStatus } from "@/hooks/useAppStatus";
import { formatDateTime } from "@/lib/numbers";
import { Button } from "@/components/ui/core";

export function SavedProfileBanner() {
  const { hydrated, hasSavedProfile, profile } = useProfile();
  const { recalculate, status: nutritionStatus } = useNutrition();
  const { generate, status: planStatus } = useDietPlan();
  const status = useAppStatus();

  if (!hydrated || !hasSavedProfile) return null;

  const firstName = profile.personalDetails.fullName.trim().split(" ")[0];
  const busy =
    (status.action.kind === "calculate" && nutritionStatus === "processing") ||
    (status.action.kind === "generate" && planStatus === "generating");

  const runAction = () => {
    if (status.action.kind === "calculate") void recalculate();
    if (status.action.kind === "generate") void generate();
  };

  return (
    <div className="page-container pt-5">
      <div className="flex flex-col items-start justify-between gap-4 rounded-card border border-brand-400/25 bg-brand-50/70 px-5 py-4 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          {status.needsAttention ? (
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
            <p className="text-sm font-bold text-ink">
              {firstName ? `Welcome back, ${firstName}.` : "Welcome back."}{" "}
              {status.title}.
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              {status.description}
              {profile.updatedAt &&
                ` Last updated ${formatDateTime(profile.updatedAt)}.`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <Button href="/dashboard" size="sm" variant="outline">
            Open Dashboard
          </Button>
          {status.action.href ? (
            <Button
              href={status.action.href}
              size="sm"
              icon={<ArrowRight className="h-3.5 w-3.5" />}
            >
              {status.action.label}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={runAction}
              loading={busy}
              disabled={busy}
              icon={<ArrowRight className="h-3.5 w-3.5" />}
            >
              {busy ? "Working…" : status.action.label}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
