"use client";

/**
 * Part 15 — Dataset library: list, search, filter, preview, import, delete.
 *
 * All data comes from /api/datasets. Actions call the real endpoints and the
 * list refreshes from the server response — a deleted row disappears because
 * the delete actually succeeded, not because the UI hid it.
 */
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  FileText,
  Loader2,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { apiClient, toUserMessage } from "@/services/apiClient";
import { formatBytes } from "@/services/attachments/config";
import { Button, Card, CardBody } from "@/components/ui/core";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/cn";
import type { ValidationReport } from "@/services/dataset/validationTypes";

export interface DatasetRow {
  id: number;
  fileName: string;
  displayName: string;
  kind: string;
  mimeType: string;
  fileSizeBytes: number;
  status: string;
  statusDetail: string;
  recordCount: number;
  imported: boolean;
  columns: string[];
  quality: {
    totalRecords: number;
    cleanRecords: number;
    needsReviewRecords: number;
    recordsWithMissingValues: number;
    duplicateParticipantIds?: string[];
    recordsWithParseErrors: number;
    recordsWithOutliers: number;
  } | null;
  statistics: {
    averageAge: number | null;
    averageCalories?: number | null;
    nutrition?: { caloriesKcal?: { mean: number | null } | null } | null;
  } | null;
  previewRows: string[][];
  warnings: string[];
  createdAt: string;
  /** Phase 7 */
  validation?: ValidationReport | null;
  importedRows?: number | null;
  rejectedRows?: number | null;
}

const STATUS_UI: Record<string, { label: string; cls: string }> = {
  uploading: { label: "Uploading", cls: "border-line bg-surface text-muted" },
  processing: { label: "Processing", cls: "border-line bg-surface text-muted" },
  ready: { label: "Ready", cls: "border-brand-400/25 bg-brand-50 text-brand-400" },
  staged: { label: "Awaiting import", cls: "border-accent-300/40 bg-accent-200/30 text-accent-300" },
  needs_review: {
    label: "Needs review",
    cls: "border-accent-300/40/30 bg-accent-200/30 text-accent-300",
  },
  failed: { label: "Failed", cls: "border-danger-500/30 bg-danger-50 text-danger-700" },
  unsupported: {
    label: "Unsupported",
    cls: "border-danger-500/30 bg-danger-50 text-danger-700",
  },
};

function StatusIcon({ status }: { status: string }) {
  if (status === "ready")
    return <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />;
  if (status === "failed" || status === "unsupported")
    return <XCircle className="h-3.5 w-3.5" aria-hidden="true" />;
  if (status === "needs_review")
    return <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />;
  if (status === "processing" || status === "uploading")
    return <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />;
  return <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />;
}

export function DatasetLibrary({
  datasets,
  onChanged,
  onDelete,
  onAnalyze,
  onResume,
}: {
  datasets: DatasetRow[];
  onChanged: () => void;
  onDelete: (id: number) => Promise<boolean>;
  onAnalyze: (id: number) => void;
  /** Phase 7: reopen the validation report of a staged (not yet imported) upload. */
  onResume?: (dataset: DatasetRow) => void;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [importing, setImporting] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return datasets.filter((dataset) => {
      const matchesText =
        !needle ||
        dataset.displayName.toLowerCase().includes(needle) ||
        dataset.kind.toLowerCase().includes(needle);
      const matchesStatus = statusFilter === "all" || dataset.status === statusFilter;
      return matchesText && matchesStatus;
    });
  }, [datasets, query, statusFilter]);

  const confirmDelete = async () => {
    if (confirmId === null || deleting) return;
    setDeleting(true);
    setActionError(null);
    const okDeleted = await onDelete(confirmId);
    setDeleting(false);
    if (okDeleted) {
      setConfirmId(null);
      if (expandedId === confirmId) setExpandedId(null);
    } else {
      setActionError("The dataset could not be deleted. Please try again.");
    }
  };

  const toggleImport = async (dataset: DatasetRow) => {
    if (importing !== null) return;
    setImporting(dataset.id);
    setActionError(null);
    try {
      await apiClient.patch(`/api/datasets/${dataset.id}`, {
        imported: !dataset.imported,
      });
      onChanged();
    } catch (err) {
      setActionError(toUserMessage(err, "Could not update the dataset."));
    } finally {
      setImporting(null);
    }
  };

  const exportCsv = (dataset: DatasetRow) => {
    const rows = [dataset.columns, ...(dataset.previewRows ?? [])];
    const csv = rows
      .map((row) =>
        row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${dataset.displayName.replace(/\.[^.]+$/, "")}-preview.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };


  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search datasets by name or type"
            aria-label="Search datasets"
            className="h-11 w-full rounded-[10px] border border-line bg-surface pl-10 pr-3.5 text-sm text-ink placeholder:text-muted/70 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          aria-label="Filter by status"
          className="h-11 rounded-[10px] border border-line bg-surface px-3.5 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15"
        >
          <option value="all">All statuses</option>
          <option value="ready">Ready</option>
          <option value="needs_review">Needs review</option>
          <option value="failed">Failed</option>
          <option value="unsupported">Unsupported</option>
        </select>
      </div>

      {actionError && (
        <p role="alert" className="rounded-[10px] bg-danger-50 px-3.5 py-2.5 text-xs text-danger-700">
          {actionError}
        </p>
      )}

      {filtered.length === 0 ? (
        <Card>
          <CardBody className="py-10 text-center">
            <FileText className="mx-auto h-8 w-8 text-muted" aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold text-ink">
              {datasets.length === 0 ? "No datasets yet" : "No datasets match your search"}
            </p>
            <p className="mt-1 text-xs text-muted">
              {datasets.length === 0
                ? "Upload a DOCX, PDF, CSV or XLSX dataset to get started."
                : "Try a different search term or clear the status filter."}
            </p>
          </CardBody>
        </Card>
      ) : (
        <ul className="space-y-3">
          {filtered.map((dataset) => {
            const status = STATUS_UI[dataset.status] ?? STATUS_UI.needs_review;
            const isOpen = expandedId === dataset.id;
            return (
              <li key={dataset.id}>
                <Card>
                  <CardBody className="py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-ink">
                            {dataset.displayName}
                          </p>
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-xs font-semibold",
                              status.cls,
                            )}
                          >
                            <StatusIcon status={dataset.status} />
                            {status.label}
                          </span>
                          {dataset.imported && (
                            <span className="rounded-pill bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-400">
                              In library
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-muted">
                          {dataset.kind.toUpperCase()} · {formatBytes(dataset.fileSizeBytes)} ·{" "}
                          {dataset.recordCount} record
                          {dataset.recordCount === 1 ? "" : "s"} ·{" "}
                          {new Date(dataset.createdAt).toLocaleDateString()}
                        </p>
                        {dataset.statusDetail && (
                          <p className="mt-1 text-xs text-muted">{dataset.statusDetail}</p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setExpandedId(isOpen ? null : dataset.id)}
                          icon={<Eye className="h-3.5 w-3.5" aria-hidden="true" />}
                          aria-expanded={isOpen}
                        >
                          {isOpen ? "Hide" : "View"}
                        </Button>
                        {dataset.recordCount > 0 && (
                          <Button
                            size="sm"
                            variant={dataset.imported ? "secondary" : "outline"}
                            loading={importing === dataset.id}
                            disabled={importing !== null}
                            onClick={() => void toggleImport(dataset)}
                          >
                            {dataset.imported ? "Remove from library" : "Import dataset"}
                          </Button>
                        )}
                        {dataset.recordCount > 0 && (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => onAnalyze(dataset.id)}
                          >
                            Analyze dataset
                          </Button>
                        )}
                        {dataset.status === "staged" && dataset.validation && onResume && (
                          <Button size="sm" variant="secondary" onClick={() => onResume(dataset)}>
                            Review &amp; import
                          </Button>
                        )}
                        {dataset.previewRows.length > 0 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => exportCsv(dataset)}
                            icon={<Download className="h-3.5 w-3.5" aria-hidden="true" />}
                          >
                            Export
                          </Button>
                        )}
                        <button
                          type="button"
                          onClick={() => setConfirmId(dataset.id)}
                          aria-label={`Delete ${dataset.displayName}`}
                          className="grid h-8 w-8 place-items-center rounded-[10px] text-muted transition-colors hover:bg-danger-50 hover:text-danger-600"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    {isOpen && (
                      <div className="mt-4 space-y-4 border-t border-line pt-4">
                        {dataset.quality && (
                          <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-muted">
                              Data quality
                            </p>
                            <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                              <QualityStat label="Total" value={dataset.quality.totalRecords} />
                              <QualityStat label="Clean" value={dataset.quality.cleanRecords} />
                              <QualityStat
                                label="Needs review"
                                value={dataset.quality.needsReviewRecords}
                              />
                              <QualityStat
                                label="Missing values"
                                value={dataset.quality.recordsWithMissingValues}
                              />
                            </dl>
                          </div>
                        )}

                        {dataset.statistics && (
                          <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-muted">
                              Analytics
                            </p>
                            <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                              <QualityStat
                                label="Average age"
                                value={dataset.statistics.averageAge ?? "—"}
                              />
                              <QualityStat
                                label="Average calories"
                                value={
                                  dataset.statistics.nutrition?.caloriesKcal?.mean ?? "—"
                                }
                              />
                              <QualityStat
                                label="Records analysed"
                                value={dataset.recordCount}
                              />
                            </dl>
                          </div>
                        )}

                        {dataset.columns.length > 0 && (
                          <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-muted">
                              Columns ({dataset.columns.length})
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {dataset.columns.map((column) => (
                                <span
                                  key={column}
                                  className="rounded-pill bg-canvas px-2.5 py-1 text-xs text-ink"
                                >
                                  {column}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {dataset.previewRows.length > 0 && (
                          <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-muted">
                              Preview (first {dataset.previewRows.length} rows)
                            </p>
                            <div className="mt-2 overflow-x-auto rounded-[10px] border border-line">
                              <table className="w-full min-w-[40rem] border-collapse text-xs">
                                <thead className="bg-canvas">
                                  <tr>
                                    {dataset.columns.slice(0, 8).map((column) => (
                                      <th
                                        key={column}
                                        scope="col"
                                        className="px-3 py-2 text-left font-semibold text-muted"
                                      >
                                        {column}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {dataset.previewRows.map((row, index) => (
                                    <tr key={index} className="border-t border-line/60">
                                      {row.slice(0, 8).map((cell, cellIndex) => (
                                        <td
                                          key={cellIndex}
                                          className="px-3 py-2 text-ink"
                                        >
                                          {cell}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {dataset.warnings.length > 0 && (
                          <ul className="space-y-1">
                            {dataset.warnings.map((warning) => (
                              <li
                                key={warning}
                                className="flex items-start gap-1.5 text-xs text-muted"
                              >
                                <AlertTriangle
                                  className="mt-0.5 h-3 w-3 shrink-0 text-accent-300"
                                  aria-hidden="true"
                                />
                                {warning}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </CardBody>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={confirmId !== null}
        title="Delete this dataset?"
        description="The dataset and all of its extracted records will be removed. Your profile is not affected. This cannot be undone."
        confirmLabel={deleting ? "Deleting…" : "Delete dataset"}
        onCancel={() => setConfirmId(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}

function QualityStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-[10px] border border-line bg-canvas p-2.5">
      <dt className="text-[11px] font-medium text-muted">{label}</dt>
      <dd className="text-sm font-bold text-ink">{value}</dd>
    </div>
  );
}
