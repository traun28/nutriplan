"use client";

/**
 * Phase 7 — Validate → Analyze → Import/Reject step for a staged upload.
 *
 * Shows the server's validation report: column summary + mapping controls,
 * data-quality counts, per-field completeness, duplicates, row error report
 * and a preview of the parsed rows. "Import valid rows" and "Cancel upload"
 * are the only two ways out — nothing is imported without confirmation.
 */
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, XCircle } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { apiClient, toUserMessage } from "@/services/apiClient";
import { Badge, Button, Card, CardBody } from "@/components/ui/core";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/cn";
import { FIELD_CATALOGUE, type ColumnMapping, type ValidationReport } from "@/services/dataset/validationTypes";

interface Props {
  datasetId: number;
  fileName: string;
  initialReport: ValidationReport;
  fileWarnings: string[];
  onImported: (summary: { imported: number; rejected: number }) => void;
  onCancelled: () => void;
}

const STATUS_TONE: Record<string, "brand" | "warning" | "danger" | "neutral"> = {
  complete: "brand",
  incomplete: "warning",
  needs_review: "danger",
};

function pct(part: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

export function ImportReview({ datasetId, fileName, initialReport, fileWarnings, onImported, onCancelled }: Props) {
  const [report, setReport] = useState<ValidationReport>(initialReport);
  const [mapping, setMapping] = useState<ColumnMapping>(() => ({ ...initialReport.columns.mapping }));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"validate" | "import" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState(fileName.replace(/\.[^.]+$/, ""));
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [open, setOpen] = useState<{ fields: boolean; errors: boolean; duplicates: boolean }>({ fields: false, errors: true, duplicates: true });

  const headers = report.columns.detected.map((d) => d.header);
  const usedFields = useMemo(() => new Set(Object.values(mapping).filter(Boolean)), [mapping]);

  const changeMapping = (header: string, field: string) => {
    setMapping((prev) => {
      const next = { ...prev };
      // A field may only be bound to one header — release it elsewhere.
      for (const [h, f] of Object.entries(next)) if (f === field && h !== header && field) next[h] = "";
      next[header] = field;
      return next;
    });
    setDirty(true);
  };

  const revalidate = useCallback(async () => {
    setBusy("validate");
    setError(null);
    try {
      const data = await apiClient.post<{ report: ValidationReport }>(`/api/datasets/${datasetId}/validate`, { mapping });
      setReport(data.report);
      setMapping({ ...data.report.columns.mapping, ...Object.fromEntries(Object.entries(mapping).filter(([, f]) => f === "")) });
      setDirty(false);
    } catch (err) {
      setError(toUserMessage(err, "The column mapping could not be applied."));
    } finally {
      setBusy(null);
    }
  }, [datasetId, mapping]);

  const doImport = useCallback(async () => {
    setBusy("import");
    setError(null);
    try {
      const data = await apiClient.post<{ imported: number; rejected: number }>(`/api/datasets/${datasetId}/import`, { displayName });
      onImported({ imported: data.imported, rejected: data.rejected });
    } catch (err) {
      setError(toUserMessage(err, "The dataset could not be imported."));
      setBusy(null);
    }
  }, [datasetId, displayName, onImported]);

  const doCancel = useCallback(async () => {
    setBusy("cancel");
    setError(null);
    try {
      await apiClient.delete(`/api/datasets/${datasetId}`);
      onCancelled();
    } catch (err) {
      setError(toUserMessage(err, "The upload could not be cancelled."));
      setBusy(null);
    }
  }, [datasetId, onCancelled]);

  const q = report.quality;
  const canImport = report.canImport && !dirty;

  return (
    <Card className="border-brand-400/30">
      <CardBody className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-400">Step 2 of 3 · Validate &amp; review</p>
            <h3 className="mt-1 text-base font-bold text-ink">{fileName}</h3>
            <p className="mt-1 text-xs text-muted">
              Nothing has been imported yet. Check the column mapping and the quality report, then choose <strong>Import valid rows</strong> or <strong>Cancel upload</strong>.
            </p>
          </div>
          <Badge tone={report.canImport ? "brand" : "danger"}>
            {report.canImport ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <XCircle className="h-3.5 w-3.5" aria-hidden="true" />}
            {report.canImport ? "Ready to import" : "Import blocked"}
          </Badge>
        </div>

        {(fileWarnings.length > 0 || report.blockers.length > 0) && (
          <ul className="space-y-1.5" aria-label="Validation notices">
            {report.blockers.map((b) => (
              <li key={b} role="alert" className="flex items-start gap-2 rounded-[10px] bg-danger-50 px-3.5 py-2.5 text-xs text-danger-700">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {b}
              </li>
            ))}
            {fileWarnings.map((w) => (
              <li key={w} className="flex items-start gap-2 rounded-[10px] bg-accent-200/30 px-3.5 py-2.5 text-xs text-ink">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-300" aria-hidden="true" />
                {w}
              </li>
            ))}
          </ul>
        )}

        {/* ---- Quality summary ---- */}
        <section aria-labelledby="quality-heading">
          <h4 id="quality-heading" className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Data quality report</h4>
          <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Total rows", q.totalRows],
              ["Valid rows", q.validRows],
              ["Invalid rows (rejected)", q.invalidRows],
              ["Duplicate IDs", q.duplicateRows],
              ["Rows with missing values", q.rowsWithMissingValues],
              ["Invalid numeric cells", q.invalidNumericCells],
              ["Unknown columns", q.unknownColumns],
              ["Rows processed", q.processedRows],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-[10px] border border-line bg-canvas px-3 py-2">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
                <dd className="text-lg font-bold text-ink">{Number(value).toLocaleString()}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <Badge tone="brand">Complete {q.recordStatus.complete} ({pct(q.recordStatus.complete, q.totalRows)})</Badge>
            <Badge tone="warning">Incomplete {q.recordStatus.incomplete} ({pct(q.recordStatus.incomplete, q.totalRows)})</Badge>
            <Badge tone="danger">Needs review {q.recordStatus.needs_review} ({pct(q.recordStatus.needs_review, q.totalRows)})</Badge>
          </div>
          <p className="mt-2 text-xs text-muted">
            Rows with parse errors (negative or non-numeric values, missing identifier) are rejected. Incomplete and needs-review rows are imported <em>with</em> their status so they can be corrected — they are never dropped silently.
          </p>
        </section>

        {/* ---- Column mapping ---- */}
        <section aria-labelledby="columns-heading">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 id="columns-heading" className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Column validation &amp; mapping</h4>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              <Badge tone="brand">Required {report.columns.required.filter((r) => r.present).length}/{report.columns.required.length}</Badge>
              <Badge tone="neutral">Optional {report.columns.optional.filter((r) => r.present).length}/{report.columns.optional.length}</Badge>
              <Badge tone={report.columns.unknown.length > 0 ? "warning" : "neutral"}>Unknown {report.columns.unknown.length}</Badge>
            </div>
          </div>
          {report.columns.missingRequired.length > 0 && (
            <p className="mt-2 text-xs text-danger-700">
              Missing required: {report.columns.missingRequired.map((f) => FIELD_CATALOGUE.find((s) => s.field === f)?.label ?? f).join(", ")}. Choose the matching column below.
            </p>
          )}
          <div className="mt-2 table-scroll rounded-[10px] border border-line">
            <table aria-label="Column validation and mapping" className="w-full min-w-[560px] text-left text-xs">
              <thead className="bg-canvas text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2">Column in file</th>
                  <th scope="col" className="px-3 py-2">Maps to</th>
                  <th scope="col" className="px-3 py-2">Type</th>
                  <th scope="col" className="px-3 py-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {headers.map((header) => {
                  const entry = report.columns.detected.find((d) => d.header === header)!;
                  const current = mapping[header] ?? "";
                  return (
                    <tr key={header} className="border-t border-line">
                      <th scope="row" className="px-3 py-2 font-semibold text-ink">{header}</th>
                      <td className="px-3 py-2">
                        <label className="sr-only" htmlFor={`map-${header}`}>Field for column {header}</label>
                        <select
                          id={`map-${header}`}
                          value={current}
                          onChange={(e) => changeMapping(header, e.target.value)}
                          className="w-full max-w-[220px] rounded-[10px] border border-line bg-surface px-2 py-1.5 text-xs text-ink focus:border-brand-500 focus:outline-none"
                        >
                          <option value="">— Not imported —</option>
                          {FIELD_CATALOGUE.map((spec) => (
                            <option key={spec.field} value={spec.field} disabled={usedFields.has(spec.field) && current !== spec.field}>
                              {spec.label}{spec.kind === "required" ? " *" : ""}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-muted">
                        {current ? (FIELD_CATALOGUE.find((s) => s.field === current)?.kind === "required" ? "Required" : "Optional") : "Unknown"}
                      </td>
                      <td className="px-3 py-2 text-muted">
                        {!current && entry.suggestion
                          ? `Looks like “${FIELD_CATALOGUE.find((s) => s.field === entry.suggestion)?.label ?? entry.suggestion}” — confirm to apply.`
                          : !current
                            ? "Will be ignored."
                            : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" disabled={!dirty || busy !== null} loading={busy === "validate"} onClick={() => void revalidate()}>
              Apply mapping &amp; re-validate
            </Button>
            {dirty && <span className="text-xs text-accent-300">Mapping changed — re-validate before importing.</span>}
          </div>
        </section>

        {/* ---- Per-field completeness ---- */}
        <Collapsible title={`Missing-data analysis by field (${report.fields.filter((f) => f.mapped && f.missing > 0).length} fields with gaps)`} open={open.fields} onToggle={() => setOpen((o) => ({ ...o, fields: !o.fields }))}>
          <div className="table-scroll rounded-[10px] border border-line">
            <table aria-label="Missing data analysis by field" className="w-full min-w-[520px] text-left text-xs">
              <thead className="bg-canvas text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2">Field</th>
                  <th scope="col" className="px-3 py-2 text-right">Total</th>
                  <th scope="col" className="px-3 py-2 text-right">Filled</th>
                  <th scope="col" className="px-3 py-2 text-right">Missing</th>
                  <th scope="col" className="px-3 py-2 text-right">Invalid</th>
                  <th scope="col" className="px-3 py-2 text-right">Missing %</th>
                </tr>
              </thead>
              <tbody>
                {report.fields.map((f) => (
                  <tr key={f.field} className={cn("border-t border-line", !f.mapped && "text-muted")}>
                    <th scope="row" className="px-3 py-1.5 font-semibold">{f.label}{!f.mapped && <span className="ml-1 font-normal">(not mapped)</span>}</th>
                    <td className="px-3 py-1.5 text-right tabular-nums">{f.total}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{f.filled}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{f.missing}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{f.invalid}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{f.missingPercent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Collapsible>

        {/* ---- Duplicates ---- */}
        {report.duplicates.length > 0 && (
          <Collapsible title={`Duplicate participant IDs (${report.duplicates.length})`} open={open.duplicates} onToggle={() => setOpen((o) => ({ ...o, duplicates: !o.duplicates }))}>
            <p className="mb-2 text-xs text-muted">Detected by identifier, not by name. Repeated rows are imported flagged as “Needs review” so you can compare and decide — nothing is deleted automatically.</p>
            <ul className="space-y-1.5 text-xs">
              {report.duplicates.slice(0, 50).map((d) => (
                <li key={d.participantId} className="rounded-[10px] border border-line bg-canvas px-3 py-2">
                  <span className="font-semibold text-ink">ID {d.participantId}</span> · rows {d.rows.join(", ")} ·{" "}
                  {d.identical ? "identical values" : `differs in: ${d.differingFields.join(", ")}`}
                </li>
              ))}
            </ul>
          </Collapsible>
        )}

        {/* ---- Error report ---- */}
        {report.errors.length > 0 && (
          <Collapsible title={`Row error report (${report.errors.length}${report.errorsTruncated ? "+" : ""})`} open={open.errors} onToggle={() => setOpen((o) => ({ ...o, errors: !o.errors }))}>
            <div className="max-h-72 overflow-auto rounded-[10px] border border-line">
              <table aria-label="Row error report" className="w-full min-w-[560px] text-left text-xs">
                <thead className="sticky top-0 bg-canvas text-[11px] uppercase tracking-wide text-muted">
                  <tr>
                    <th scope="col" className="px-3 py-2">Row</th>
                    <th scope="col" className="px-3 py-2">Field</th>
                    <th scope="col" className="px-3 py-2">Problem</th>
                    <th scope="col" className="px-3 py-2">Expected format</th>
                  </tr>
                </thead>
                <tbody>
                  {report.errors.map((e, i) => (
                    <tr key={`${e.row}-${e.field}-${i}`} className="border-t border-line align-top">
                      <td className="px-3 py-1.5 tabular-nums">{e.row}</td>
                      <td className="px-3 py-1.5 font-semibold text-ink">{e.field}</td>
                      <td className="px-3 py-1.5">{e.problem}</td>
                      <td className="px-3 py-1.5 text-muted">{e.expected}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {report.errorsTruncated && <p className="mt-1 text-xs text-muted">Showing the first {report.errors.length} problems.</p>}
          </Collapsible>
        )}

        {/* ---- Preview ---- */}
        <section aria-labelledby="preview-heading">
          <h4 id="preview-heading" className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Import preview (first {report.preview.length} rows as they will be stored)</h4>
          <div className="mt-2 table-scroll rounded-[10px] border border-line">
            <table aria-label="Import preview of the rows as they will be stored" className="w-full min-w-[720px] text-left text-xs">
              <thead className="bg-canvas text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2">Row</th>
                  <th scope="col" className="px-3 py-2">ID</th>
                  <th scope="col" className="px-3 py-2">Name</th>
                  <th scope="col" className="px-3 py-2 text-right">Age</th>
                  <th scope="col" className="px-3 py-2">Gender</th>
                  <th scope="col" className="px-3 py-2 text-right">Height</th>
                  <th scope="col" className="px-3 py-2 text-right">Weight</th>
                  <th scope="col" className="px-3 py-2 text-right">BMI</th>
                  <th scope="col" className="px-3 py-2 text-right">kcal</th>
                  <th scope="col" className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {report.preview.map((r) => (
                  <tr key={r.row} className={cn("border-t border-line", !r.importable && "bg-danger-50/60")}>
                    <td className="px-3 py-1.5 tabular-nums">{r.row}</td>
                    <td className="px-3 py-1.5 font-semibold text-ink">{r.participantId || "—"}</td>
                    <td className="px-3 py-1.5">{r.name || "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{r.age ?? "—"}</td>
                    <td className="px-3 py-1.5">{r.gender || "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{r.heightCm ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{r.weightKg ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{r.bmi ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{r.caloriesKcal ?? "—"}</td>
                    <td className="px-3 py-1.5">
                      <Badge tone={r.importable ? STATUS_TONE[r.recordStatus] : "danger"} className="px-2 py-0.5 text-[11px]">
                        {r.importable ? r.recordStatus.replace("_", " ") : "rejected"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-[10px] bg-danger-50 px-3.5 py-2.5 text-xs text-danger-700">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}

        {/* ---- Actions ---- */}
        <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1">
            <label htmlFor="dataset-name" className="text-xs font-semibold text-ink">Dataset name</label>
            <input
              id="dataset-name"
              value={displayName}
              maxLength={120}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 w-full max-w-sm rounded-[10px] border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => setConfirmCancel(true)}>
              Cancel upload
            </Button>
            <Button size="sm" disabled={!canImport || busy !== null} loading={busy === "import"} onClick={() => void doImport()}>
              {busy === "import" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Import {q.importableRows.toLocaleString()} valid row{q.importableRows === 1 ? "" : "s"}
              {q.invalidRows > 0 ? ` (reject ${q.invalidRows})` : ""}
            </Button>
          </div>
        </div>
      </CardBody>

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel this upload?"
        description="The staged file and its validation report will be discarded. No records were imported."
        confirmLabel="Discard upload"
        cancelLabel="Keep reviewing"
        tone="danger"
        onConfirm={() => {
          setConfirmCancel(false);
          void doCancel();
        }}
        onCancel={() => setConfirmCancel(false)}
      />
    </Card>
  );
}

function Collapsible({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <section className="rounded-[10px] border border-line">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-muted hover:text-ink">
        {title}
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && <div className="border-t border-line p-3">{children}</div>}
    </section>
  );
}
