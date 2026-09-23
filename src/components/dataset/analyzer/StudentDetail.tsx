"use client";

/**
 * Phase 7 — individual student view + review workflow.
 *
 * Profile · measurements (BMI via the shared calculator) · nutrition
 * (recorded / calculated reference / status) · data quality (status, issues,
 * potential outliers) · review controls (edit with validation, mark reviewed,
 * exclude/include, note). All changes go through PATCH
 * /api/datasets/:id/records/:recordId, which re-validates server-side.
 */
import { AlertTriangle, CheckCircle2, Loader2, Pencil, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient, ApiError, toUserMessage } from "@/services/apiClient";
import { Badge, Button } from "@/components/ui/core";
import { FIELD_CATALOGUE } from "@/services/dataset/validationTypes";
import { cn } from "@/lib/cn";

interface Detail {
  id: number;
  rowIndex: number;
  profile: { participantId: string; name: string; age: number | null; gender: string; activityLevel: string; activityMapped: string | null };
  measurements: { heightCm: number | null; weightKg: number | null; bmi: { value: number; category: string; label: string } | null };
  nutrition: {
    recorded: Record<string, number | null>;
    diagnostics: { macroDerivedCalories: number | null; calorieDifferencePercent: number | null; consistency: string };
    calculatedReference: { caloriesKcal: number | null; available: boolean; note: string };
    status: string;
    assessment: Array<{ key: string; label: string; unit: string; actual: number | null; target: number | null; status: string; percentageOfTarget: number | null }>;
  };
  meals: Record<string, string[]>;
  quality: { recordStatus: string; qualityStatus: string; issues: string[]; outliers: string[]; reviewed: boolean; reviewedAt: string | null; excluded: boolean; note: string; editedAt: string | null; editHistory: Array<{ at: string; field: string; from: unknown; to: unknown }> };
  source: { row: number; importedAt: string | null };
}

interface Props {
  datasetId: number;
  recordId: number;
  onClose: () => void;
  onChanged: () => void;
}

const STATUS_TONE: Record<string, "brand" | "warning" | "danger" | "neutral"> = { complete: "brand", incomplete: "warning", needs_review: "danger" };
const NUTRITION_LABEL: Record<string, string> = { below_target: "Below target", adequate: "Adequate", above_reference: "Above reference", significantly_below: "Significantly below", significantly_above: "Significantly above", not_assessable: "Not assessable" };
const EDITABLE = FIELD_CATALOGUE.filter((f) => !["breakfast", "lunch", "dinner", "snacks"].includes(f.field));

const fmt = (v: number | null | undefined, unit = "") => (v === null || v === undefined ? "Missing" : `${Number.isInteger(v) ? v : v.toFixed(1)}${unit ? " " + unit : ""}`);

export function StudentDetail({ datasetId, recordId, onClose, onChanged }: Props) {
  const [record, setRecord] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get<{ record: Detail }>(`/api/datasets/${datasetId}/records/${recordId}`);
      setRecord(res.record);
      setNote(res.record.quality.note);
    } catch (err) {
      setError(toUserMessage(err, "The record could not be loaded."));
    }
  }, [datasetId, recordId]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const startEdit = () => {
    if (!record) return;
    const d: Record<string, string> = {
      participantId: record.profile.participantId,
      name: record.profile.name,
      age: record.profile.age?.toString() ?? "",
      gender: record.profile.gender,
      heightCm: record.measurements.heightCm?.toString() ?? "",
      weightKg: record.measurements.weightKg?.toString() ?? "",
      activityLevel: record.profile.activityLevel,
    };
    for (const [k, v] of Object.entries(record.nutrition.recorded)) d[k] = v === null ? "" : String(v);
    setDraft(d);
    setFieldErrors({});
    setEditing(true);
  };

  const patch = async (body: Record<string, unknown>, label: string) => {
    setSaving(label);
    setError(null);
    setFlash(null);
    try {
      const res = await apiClient.patch<{ record: Detail }>(`/api/datasets/${datasetId}/records/${recordId}`, body);
      setRecord(res.record);
      setNote(res.record.quality.note);
      setFlash(`${label} saved.`);
      onChanged();
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 422 && err.details && typeof err.details === "object" && "fieldErrors" in err.details) {
        setFieldErrors((err.details as { fieldErrors: Record<string, string> }).fieldErrors);
        setError("Some values are not valid — see the highlighted fields.");
      } else {
        setError(toUserMessage(err, "The change could not be saved."));
      }
      return false;
    } finally {
      setSaving(null);
    }
  };

  const saveEdit = async () => {
    if (!record) return;
    const fields: Record<string, string> = {};
    for (const spec of EDITABLE) {
      const current = draftBaseline(record)[spec.field] ?? "";
      if ((draft[spec.field] ?? "") !== current) fields[spec.field] = draft[spec.field] ?? "";
    }
    if (Object.keys(fields).length === 0) { setEditing(false); return; }
    const ok = await patch({ fields }, "Correction");
    if (ok) setEditing(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex justify-end bg-canvas/70 backdrop-blur-sm" role="presentation" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-detail-title"
        onClick={(e) => e.stopPropagation()}
        className="np-drawer flex h-full w-full max-w-2xl flex-col overflow-hidden border-l border-line bg-surface shadow-pop"
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wide text-brand-400">Student record · row {record?.source.row ?? "…"}</p>
            <h2 id="student-detail-title" className="truncate text-lg font-bold text-ink">
              {record ? `${record.profile.name || "Unnamed"} · ${record.profile.participantId || "no ID"}` : "Loading…"}
            </h2>
            {record && (
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Badge tone={STATUS_TONE[record.quality.recordStatus] ?? "neutral"}>{record.quality.recordStatus.replace("_", " ")}</Badge>
                {record.quality.outliers.length > 0 && <Badge tone="warning">Potential outlier</Badge>}
                {record.quality.reviewed && <Badge tone="brand"><CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Reviewed</Badge>}
                {record.quality.excluded && <Badge tone="neutral">Excluded from analytics</Badge>}
              </div>
            )}
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close record" className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-muted hover:bg-canvas hover:text-ink">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && <p role="alert" className="mb-3 flex items-start gap-2 rounded-[10px] bg-danger-50 px-3 py-2 text-xs text-danger-700"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{error}</p>}
          {flash && <p role="status" className="mb-3 rounded-[10px] bg-brand-50 px-3 py-2 text-xs text-brand-400">{flash}</p>}
          {!record && !error && <div className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading record…</div>}

          {record && !editing && (
            <div className="space-y-5">
              <Section title="Profile">
                <Dl items={[["Participant ID", record.profile.participantId || "Missing"], ["Name", record.profile.name || "Missing"], ["Age", fmt(record.profile.age, "years")], ["Gender", record.profile.gender || "Not recorded"], ["Activity level", record.profile.activityLevel ? `${record.profile.activityLevel}${record.profile.activityMapped ? "" : " (not mapped)"}` : "Not recorded"]]} />
              </Section>

              <Section title="Measurements">
                <Dl items={[["Height", fmt(record.measurements.heightCm, "cm")], ["Weight", fmt(record.measurements.weightKg, "kg")], ["BMI", record.measurements.bmi ? `${record.measurements.bmi.value} · ${record.measurements.bmi.label}` : "Cannot be calculated (needs valid height and weight)"]]} />
                <p className="mt-1 text-[11px] text-muted">BMI = weight ÷ height². Category labels are general screening ranges, not a diagnosis.</p>
              </Section>

              <Section title="Nutrition">
                <p className="text-xs text-muted">
                  Status: <strong className="text-ink">{NUTRITION_LABEL[record.nutrition.status] ?? record.nutrition.status}</strong> — potential gap based on recorded data.
                  {" "}Calculated reference: {record.nutrition.calculatedReference.available ? `${record.nutrition.calculatedReference.caloriesKcal} kcal` : "not available"}. {record.nutrition.calculatedReference.note}
                </p>
                <div className="mt-2 table-scroll rounded-[10px] border border-line">
                  <table aria-label="Recorded values versus calculated reference" className="w-full text-left text-xs">
                    <thead className="bg-canvas text-[11px] uppercase tracking-wide text-muted">
                      <tr><th scope="col" className="px-3 py-1.5">Nutrient</th><th scope="col" className="px-3 py-1.5 text-right">Recorded</th><th scope="col" className="px-3 py-1.5 text-right">Calculated reference</th><th scope="col" className="px-3 py-1.5">Comparison</th></tr>
                    </thead>
                    <tbody>
                      {record.nutrition.assessment.map((n) => (
                        <tr key={n.key} className="border-t border-line">
                          <th scope="row" className="px-3 py-1.5 font-semibold text-ink">{n.label}</th>
                          <td className="px-3 py-1.5 text-right tabular-nums">{n.actual === null ? <span className="text-muted">Missing</span> : `${n.actual} ${n.unit}`}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{n.target === null ? <span className="text-muted">{n.actual === null ? "—" : "Not calculated"}</span> : `${Math.round(n.target)} ${n.unit}`}</td>
                          <td className="px-3 py-1.5">{n.status === "not_assessable" ? <span className="text-muted">Not assessable</span> : `${NUTRITION_LABEL[n.status] ?? n.status}${n.percentageOfTarget !== null ? ` (${n.percentageOfTarget}% of reference)` : ""}`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {record.nutrition.diagnostics.macroDerivedCalories !== null && (
                  <p className="mt-1 text-[11px] text-muted">Macro-derived calories: {record.nutrition.diagnostics.macroDerivedCalories} kcal ({record.nutrition.diagnostics.consistency.replace("_", " ")}{record.nutrition.diagnostics.calorieDifferencePercent !== null ? `, ${record.nutrition.diagnostics.calorieDifferencePercent}% difference` : ""}). Recorded values are never overwritten.</p>
                )}
              </Section>

              <Section title="Recorded meals">
                {Object.values(record.meals).every((m) => m.length === 0) ? (
                  <p className="text-xs text-muted">No meal details were recorded.</p>
                ) : (
                  <Dl items={Object.entries(record.meals).map(([k, v]) => [k[0].toUpperCase() + k.slice(1), v.length ? v.join(", ") : "None recorded"])} />
                )}
              </Section>

              <Section title="Data quality">
                <Dl items={[["Record status", record.quality.recordStatus.replace("_", " ")], ["Quality flag", record.quality.qualityStatus.replace("_", " ")]]} />
                {record.quality.issues.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs">
                    {record.quality.issues.map((i) => <li key={i} className="flex items-start gap-2 rounded-[10px] bg-canvas px-2.5 py-1.5"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-accent-300" aria-hidden="true" />{i}</li>)}
                  </ul>
                )}
                {record.quality.outliers.length > 0 && (
                  <p className="mt-2 text-xs text-ink"><strong>Potential outlier:</strong> {record.quality.outliers.join("; ")}. Kept as recorded — check against the source.</p>
                )}
                {record.quality.editHistory.length > 0 && (
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer text-muted">Edit history ({record.quality.editHistory.length})</summary>
                    <ul className="mt-1 space-y-0.5 text-muted">
                      {record.quality.editHistory.slice().reverse().map((h, i) => <li key={i}>{new Date(h.at).toLocaleString()} · {FIELD_CATALOGUE.find((f) => f.field === h.field)?.label ?? h.field}: {String(h.from ?? "empty")} → {String(h.to ?? "empty")}</li>)}
                    </ul>
                  </details>
                )}
              </Section>

              <Section title="Review">
                <label htmlFor="review-note" className="text-xs font-semibold text-ink">Review note (optional)</label>
                <textarea id="review-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1 w-full rounded-[10px] border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none" placeholder="e.g. Height confirmed with the source sheet" />
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" icon={<Pencil className="h-3.5 w-3.5" aria-hidden="true" />} onClick={startEdit} disabled={saving !== null}>Correct values</Button>
                  <Button size="sm" variant={record.quality.reviewed ? "outline" : "secondary"} loading={saving === "Review status"} disabled={saving !== null} onClick={() => void patch({ reviewed: !record.quality.reviewed, note }, "Review status")}>
                    {record.quality.reviewed ? "Unmark reviewed" : "Mark as reviewed"}
                  </Button>
                  <Button size="sm" variant="outline" loading={saving === "Exclusion"} disabled={saving !== null} onClick={() => void patch({ excluded: !record.quality.excluded, note }, "Exclusion")}>
                    {record.quality.excluded ? "Include in analytics" : "Exclude from analytics"}
                  </Button>
                  {note !== record.quality.note && <Button size="sm" variant="ghost" loading={saving === "Note"} disabled={saving !== null} onClick={() => void patch({ note }, "Note")}>Save note</Button>}
                </div>
                <p className="mt-2 text-[11px] text-muted">Excluding hides the record from statistics and exports; it is never deleted. Delete the whole dataset from the library if you need to remove data.</p>
              </Section>
            </div>
          )}

          {record && editing && (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void saveEdit(); }}>
              <p className="text-xs text-muted">Corrections are re-validated with the same rules used at import; BMI, status and quality flags are recalculated. Previous values are kept in the edit history.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {EDITABLE.map((spec) => (
                  <div key={spec.field}>
                    <label htmlFor={`edit-${spec.field}`} className="text-xs font-semibold text-ink">{spec.label}{spec.kind === "required" ? " *" : ""}</label>
                    <input
                      id={`edit-${spec.field}`}
                      type={spec.type === "number" ? "number" : "text"}
                      step={spec.type === "number" ? "any" : undefined}
                      inputMode={spec.type === "number" ? "decimal" : undefined}
                      value={draft[spec.field] ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, [spec.field]: e.target.value }))}
                      aria-invalid={Boolean(fieldErrors[spec.field])}
                      aria-describedby={fieldErrors[spec.field] ? `err-${spec.field}` : undefined}
                      className={cn("mt-1 w-full rounded-[10px] border bg-surface px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none", fieldErrors[spec.field] ? "border-danger-500" : "border-line")}
                    />
                    <p className="mt-0.5 text-[11px] text-muted">{spec.expected}</p>
                    {fieldErrors[spec.field] && <p id={`err-${spec.field}`} className="text-[11px] text-danger-700">{fieldErrors[spec.field]}</p>}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm" loading={saving === "Correction"} disabled={saving !== null}>Save corrections</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving !== null}>Cancel</Button>
              </div>
            </form>
          )}
        </div>
      </aside>
    </div>
  );
}

function draftBaseline(record: Detail): Record<string, string> {
  const d: Record<string, string> = {
    participantId: record.profile.participantId,
    name: record.profile.name,
    age: record.profile.age?.toString() ?? "",
    gender: record.profile.gender,
    heightCm: record.measurements.heightCm?.toString() ?? "",
    weightKg: record.measurements.weightKg?.toString() ?? "",
    activityLevel: record.profile.activityLevel,
  };
  for (const [k, v] of Object.entries(record.nutrition.recorded)) d[k] = v === null ? "" : String(v);
  return d;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-muted">{title}</h3>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}

function Dl({ items }: { items: Array<[string, string]> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 border-b border-line/60 py-1">
          <dt className="text-muted">{k}</dt>
          <dd className="text-right font-medium text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
