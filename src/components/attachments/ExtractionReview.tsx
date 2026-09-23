/**
 * Part 12 — "Review Extracted Information" screen.
 *
 * CRITICAL: extracted values are CANDIDATES. This screen shows each one
 * beside the live profile value with a confidence and provenance, and the
 * user explicitly chooses what to import. Safety-relevant changes
 * (allergies, intolerances, foods to avoid) are ALWAYS additions and
 * require an extra confirmation — they never overwrite the profile.
 */
"use client";

import {
  ArrowLeft,
  Check,
  Download,
  Info,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { AttachmentRecord } from "@/types/attachment.ts";
import { useProfile } from "@/context/ProfileContext";
import { useNutrition } from "@/context/NutritionContext";
import { useDietPlan } from "@/context/DietPlanContext";
import {
  buildPatch,
  buildReviewItems,
  type ReviewItem,
} from "@/services/attachments/conflicts.ts";
import { Button, Card, CardBody } from "@/components/ui/core";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/numbers";

const CONFIDENCE_CLASS: Record<string, string> = {
  high: "border-brand-400/25 bg-brand-50 text-brand-400",
  medium: "border-accent-300/40 bg-accent-200/30 text-accent-300",
  low: "border-danger-500/30 bg-danger-50 text-danger-700",
  unknown: "border-line bg-canvas text-muted",
};

interface Props {
  record: AttachmentRecord;
  onBack: () => void;
}

export function ExtractionReview({ record, onBack }: Props) {
  const { profile, applyImportedPatch, saveProfile, hasSavedProfile } = useProfile();
  const { recalculate, status: nutritionStatus } = useNutrition();
  const { generate, status: planStatus } = useDietPlan();

  const items = useMemo(() => buildReviewItems(record, profile), [record, profile]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [imported, setImported] = useState(false);
  const [importSummary, setImportSummary] = useState<string[]>([]);

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedItems = items.filter((item) => selected.has(item.id));
  const patch = useMemo(() => buildPatch(selectedItems, profile), [selectedItems, profile]);
  const safetyItems = selectedItems.filter((item) => item.safetyRelevant);

  const handleConfirm = async () => {
    applyImportedPatch(patch);
    const saved = await saveProfile();
    if (saved) {
      await recalculate(saved);
      setImported(true);
      setImportSummary(patch.summary);
      setConfirmOpen(false);
    }
  };

  /* --------------------------- imported state --------------------------- */
  if (imported) {
    return (
      <Card>
        <CardBody className="space-y-4">
          <div className="flex items-start gap-3">
            <Check className="mt-0.5 h-6 w-6 shrink-0 text-brand-400" aria-hidden="true" />
            <div>
              <h2 className="text-base font-bold text-ink">
                Information imported from {record.displayName}
              </h2>
              <p className="mt-1 text-sm text-muted">
                Your profile was updated and your nutrition targets were
                recalculated. Imported fields:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink">
                {importSummary.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {patch.touchesSafety && (
                <p className="mt-3 flex items-start gap-2 rounded-[10px] bg-brand-50 p-3 text-xs text-brand-400">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  Your existing allergies, intolerances and foods to avoid were
                  kept. New restrictions were added alongside them, not in
                  place of them.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2.5 border-t border-line pt-4">
            {planStatus !== "generating" && (
              <Button
                onClick={() => generate()}
                icon={<Sparkles className="h-4 w-4" />}
              >
                Generate a new diet plan
              </Button>
            )}
            <Button
              href="/nutrition"
              variant="outline"
              icon={<Info className="h-4 w-4" />}
            >
              View updated targets
            </Button>
            <Button variant="ghost" onClick={onBack}>
              Back to attachments
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  /* --------------------------- review state ---------------------------- */
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink">
            Review extracted information
          </h2>
          <p className="mt-1 text-sm text-muted">
            From <span className="font-semibold text-ink">{record.displayName}</span>
            {record.uploadedAt && ` · ${formatDateTime(record.uploadedAt)}`}. Choose what to import — nothing is applied until you confirm.
          </p>
        </div>
        <Button variant="ghost" onClick={onBack} icon={<ArrowLeft className="h-4 w-4" />}>
          Back
        </Button>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardBody className="py-6 text-center">
            <Info className="mx-auto h-6 w-6 text-muted" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-ink">
              No structured information was recognised
            </p>
            <p className="mt-1 text-xs text-muted">
              The document was processed, but no profile fields, nutrients or
              foods matched a known pattern. It has been kept as a reference.
            </p>
            {record.extraction?.text && (
              <details className="mt-3 text-left">
                <summary className="cursor-pointer text-xs font-semibold text-brand-400">
                  View extracted text ({record.extraction.text.length} chars)
                </summary>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-[10px] bg-canvas p-3 text-xs text-muted">
                  {record.extraction.text.slice(0, 4000)}
                </pre>
              </details>
            )}
          </CardBody>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span>
              {selected.size} of {items.length} item(s) selected
            </span>
            <button
              type="button"
              onClick={() =>
                setSelected((current) =>
                  current.size === items.length
                    ? new Set()
                    : new Set(items.map((item) => item.id)),
                )
              }
              className="font-semibold text-brand-400 hover:underline"
            >
              {selected.size === items.length ? "Clear all" : "Select all"}
            </button>
          </div>

          <div className="space-y-2.5">
            {items.map((item) => (
              <ReviewRow
                key={item.id}
                item={item}
                checked={selected.has(item.id)}
                onToggle={() => toggle(item.id)}
              />
            ))}
          </div>

          {selectedItems.length > 0 && (
            <Card className="border-brand-400/25 bg-brand-50/50">
              <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-ink">
                    {selectedItems.length} item(s) ready to import
                  </p>
                  {safetyItems.length > 0 && (
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-brand-400">
                      <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                      Includes {safetyItems.length} safety-related addition(s) — you will be asked to confirm.
                    </p>
                  )}
                  {!hasSavedProfile && (
                    <p className="mt-0.5 text-xs text-muted">
                      Your profile will be saved so the changes persist.
                    </p>
                  )}
                </div>
                <Button
                  onClick={() => setConfirmOpen(true)}
                  disabled={nutritionStatus === "processing"}
                  loading={nutritionStatus === "processing"}
                  icon={<Download className="h-4 w-4" />}
                >
                  {hasSavedProfile ? "Apply & recalculate" : "Save profile & recalculate"}
                </Button>
              </CardBody>
            </Card>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={patch.touchesSafety ? "Confirm safety-relevant import" : "Confirm import"}
        description={
          patch.touchesSafety
            ? "You are adding allergy/intolerance/food-to-avoid information from this document. Your existing restrictions will be kept and the new ones added. This cannot silently remove a safety restriction. Continue?"
            : `Apply ${selectedItems.length} extracted item(s) to your profile and recalculate your nutrition targets?`
        }
        confirmLabel="Apply changes"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void handleConfirm()}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ReviewRow({
  item,
  checked,
  onToggle,
}: {
  item: ReviewItem;
  checked: boolean;
  onToggle: () => void;
}) {
  const conflictBadge =
    item.conflictType === "different_value"
      ? { label: "Different from profile", cls: "border-accent-300/40 bg-accent-200/30 text-accent-300" }
      : item.conflictType === "safety_relevant"
        ? { label: "Safety addition", cls: "border-danger-500/30 bg-danger-50 text-danger-700" }
        : { label: "New information", cls: "border-brand-400/25 bg-brand-50 text-brand-400" };

  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-card border p-3.5 transition-all",
        checked
          ? "border-brand-400 bg-brand-50/60"
          : "border-line bg-surface hover:border-brand-400/50",
        item.safetyRelevant && "border-l-4 border-l-danger-400",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-1 h-4 w-4 shrink-0 accent-brand-600"
        aria-label={`Import ${item.label}: ${item.extractedValue}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-ink">{item.label}</span>
          <span
            className={cn(
              "rounded-pill border px-2 py-0.5 text-[11px] font-semibold",
              conflictBadge.cls,
            )}
          >
            {conflictBadge.label}
          </span>
          <span
            className={cn(
              "rounded-pill border px-2 py-0.5 text-[11px] font-semibold capitalize",
              CONFIDENCE_CLASS[item.confidence],
            )}
          >
            {item.confidence} confidence
          </span>
        </div>

        <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
          <div className="rounded-[10px] bg-surface p-2.5">
            <p className="font-semibold text-muted">In the document</p>
            <p className="mt-0.5 break-words font-semibold text-ink">
              {item.extractedValue}
            </p>
          </div>
          <div className="rounded-[10px] bg-canvas p-2.5">
            <p className="font-semibold text-muted">In your profile now</p>
            <p className="mt-0.5 break-words text-ink">
              {item.currentValue ?? "—"}
            </p>
          </div>
        </div>

        <p className="mt-2 text-[11px] text-muted">
          Source: {item.provenance}
        </p>
      </div>
    </label>
  );
}
