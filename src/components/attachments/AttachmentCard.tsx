/**
 * Part 12 — one attachment card.
 *
 * Shows the file identity, processing status, a quick extraction summary,
 * and the actions available for its current state. Nothing about the
 * original binary is exposed.
 */
"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Eye,
  FileText,
  FileType2,
  Image as ImageIcon,
  Sheet,
  Trash2,
  XCircle,
} from "lucide-react";
import type { AttachmentRecord, AttachmentStatus } from "@/types/attachment.ts";
import { formatBytes, KIND_LABEL } from "@/services/attachments/config.ts";
import { Card } from "@/components/ui/core";
import { cn } from "@/lib/cn";

const STATUS_UI: Record<
  AttachmentStatus,
  { label: string; tone: string; icon: React.ReactNode }
> = {
  selected: { label: "Selected", tone: "neutral", icon: <Clock3 className="h-3.5 w-3.5" aria-hidden="true" /> },
  uploading: { label: "Uploading", tone: "neutral", icon: <Clock3 className="h-3.5 w-3.5" aria-hidden="true" /> },
  processing: { label: "Processing", tone: "neutral", icon: <Clock3 className="h-3.5 w-3.5 animate-pulse" aria-hidden="true" /> },
  extracting: { label: "Extracting", tone: "neutral", icon: <Clock3 className="h-3.5 w-3.5 animate-pulse" aria-hidden="true" /> },
  ready_for_review: { label: "Ready for review", tone: "brand", icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> },
  imported: { label: "Imported", tone: "brand", icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> },
  kept_as_reference: { label: "Kept as reference", tone: "neutral", icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> },
  needs_review: { label: "Needs review", tone: "warning", icon: <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> },
  unsupported: { label: "Unsupported", tone: "danger", icon: <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> },
  failed: { label: "Failed", tone: "danger", icon: <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> },
};

const toneClass: Record<string, string> = {
  neutral: "border-line bg-surface text-muted",
  brand: "border-brand-400/25 bg-brand-50 text-brand-400",
  warning: "border-accent-300/40/30 bg-accent-200/30 text-accent-300",
  danger: "border-danger-500/30 bg-danger-50 text-danger-700",
};

function KindIcon({ kind }: { kind: AttachmentRecord["kind"] }) {
  const cls = "h-5 w-5 text-brand-400";
  if (kind === "image") return <ImageIcon className={cls} aria-hidden="true" />;
  if (kind === "csv" || kind === "xlsx" || kind === "xls")
    return <Sheet className={cls} aria-hidden="true" />;
  if (kind === "pdf") return <FileType2 className={cls} aria-hidden="true" />;
  return <FileText className={cls} aria-hidden="true" />;
}

interface Props {
  record: AttachmentRecord;
  onReview?: (record: AttachmentRecord) => void;
  onRemove?: (attachmentId: string) => void;
}

export function AttachmentCard({ record, onReview, onRemove }: Props) {
  const status = STATUS_UI[record.status] ?? STATUS_UI.needs_review;
  const extraction = record.extraction;
  const canReview =
    extraction !== null &&
    (extraction.fields.length > 0 ||
      extraction.nutrients.length > 0 ||
      extraction.foods.length > 0 ||
      extraction.text.length > 0);

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-brand-50">
            <KindIcon kind={record.kind} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink" title={record.displayName}>
              {record.displayName}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {KIND_LABEL[record.kind]} · {formatBytes(record.fileSizeBytes)}
              {record.processingMs !== null && ` · ${record.processingMs} ms`}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-xs font-semibold",
              toneClass[status.tone],
            )}
          >
            {status.icon}
            {status.label}
          </span>
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(record.attachmentId)}
              aria-label={`Remove ${record.displayName}`}
              className="grid h-8 w-8 place-items-center rounded-[10px] text-muted transition-colors hover:bg-danger-50 hover:text-danger-600"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Status detail */}
      {record.statusDetail && (
        <p
          className={cn(
            "mt-3 rounded-[10px] border p-3 text-xs leading-relaxed",
            record.status === "failed" || record.status === "unsupported"
              ? "border-danger-500/30 bg-danger-50 text-danger-700"
              : record.status === "needs_review"
                ? "border-accent-300/40/30 bg-accent-200/30 text-ink/80"
                : "border-line bg-canvas text-muted",
          )}
        >
          {record.statusDetail}
        </p>
      )}

      {/* Extraction summary */}
      {extraction && canReview && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2 text-xs">
            {extraction.fields.length > 0 && (
              <span className="rounded-pill bg-brand-50 px-2.5 py-1 font-semibold text-brand-400">
                {extraction.fields.length} field{extraction.fields.length === 1 ? "" : "s"}
              </span>
            )}
            {extraction.nutrients.length > 0 && (
              <span className="rounded-pill bg-brand-50 px-2.5 py-1 font-semibold text-brand-400">
                {extraction.nutrients.length} nutrient{extraction.nutrients.length === 1 ? "" : "s"}
              </span>
            )}
            {extraction.foods.length > 0 && (
              <span className="rounded-pill bg-brand-50 px-2.5 py-1 font-semibold text-brand-400">
                {extraction.foods.length} food{extraction.foods.length === 1 ? "" : "s"}
              </span>
            )}
            {extraction.tables.length > 0 && (
              <span className="rounded-pill bg-brand-50 px-2.5 py-1 font-semibold text-brand-400">
                {extraction.tables.length} table{extraction.tables.length === 1 ? "" : "s"}
              </span>
            )}
            {extraction.pageCount !== null && (
              <span className="rounded-pill bg-canvas px-2.5 py-1 text-muted">
                {extraction.pageCount} page{extraction.pageCount === 1 ? "" : "s"}
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {onReview && (
              <button
                type="button"
                onClick={() => onReview(record)}
                className="inline-flex items-center gap-1.5 rounded-[10px] bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-800"
              >
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                Review extracted information
              </button>
            )}
          </div>
        </div>
      )}

      {/* Warnings */}
      {extraction && extraction.warnings.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-line pt-3">
          {extraction.warnings.slice(0, 3).map((warning) => (
            <li key={warning} className="flex items-start gap-1.5 text-xs text-muted">
              <AlertTriangle
                className="mt-0.5 h-3 w-3 shrink-0 text-accent-300"
                aria-hidden="true"
              />
              {warning}
            </li>
          ))}
          {extraction.warnings.length > 3 && (
            <li className="text-xs text-muted">
              +{extraction.warnings.length - 3} more note(s)
            </li>
          )}
        </ul>
      )}
    </Card>
  );
}
