"use client";

/**
 * Phase 5 — progress tracking: body-weight entries (add / edit / delete),
 * chronological history, a trend chart drawn only from recorded points,
 * body metrics via the existing BMI methodology, and neutral goal
 * context (current, profile weight, difference). No predictions.
 */
import { AlertTriangle, Loader2, Pencil, Plus, Scale, Trash2, TrendingUp, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, CardBody, EmptyState } from "@/components/ui/core";
import { TextField } from "@/components/ui/inputs";
import { Dialog } from "@/components/ui/Dialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Toast, useToast } from "@/components/ui/Toast";
import { LineChart } from "@/components/analytics/charts";
import { PageShell } from "@/components/recipes/recipeUi";
import { toDateKey } from "@/services/foodLog/calculations";
import { GOALS, labelFor } from "@/data/options";
import type { ProgressEntry } from "@/services/server/progressRepository";
import type { bodyMetrics } from "@/services/server/analyticsService";
import { cn } from "@/lib/cn";

type Metrics = ReturnType<typeof bodyMetrics>;
type Range = 30 | 90 | 365 | 0;

function formatDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: y === new Date().getFullYear() ? undefined : "numeric" });
}

async function api<T>(path: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  try {
    const r = await fetch(path, { ...init, headers: { "content-type": "application/json" }, credentials: "same-origin" });
    const text = await r.text();
    const payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    if (!r.ok) return { ok: false, message: String(payload.error ?? "The request could not be completed.") };
    return { ok: true, data: payload as T };
  } catch {
    return { ok: false, message: "Could not reach the server. Check your connection and try again." };
  }
}

export function ProgressTracker() {
  const { toast, show, dismiss } = useToast();
  const [entries, setEntries] = useState<ProgressEntry[] | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ProgressEntry | null | "new">(null);
  const [deleting, setDeleting] = useState<ProgressEntry | null>(null);
  const [range, setRange] = useState<Range>(90);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setStatus("loading");
    const r = await api<{ entries: ProgressEntry[]; metrics: Metrics }>("/api/progress");
    if (r.ok) {
      setEntries(r.data.entries);
      setMetrics(r.data.metrics);
      setStatus("ready");
    } else {
      setError(r.message);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const [now] = useState(() => Date.now());
  const chartPoints = useMemo(() => {
    if (!entries) return [];
    const asc = [...entries].sort((a, b) => a.entryDate.localeCompare(b.entryDate));
    const cutoff = range === 0 ? null : toDateKey(new Date(now - range * 86_400_000));
    return asc.filter((e) => !cutoff || e.entryDate >= cutoff).map((e) => ({ label: formatDay(e.entryDate), value: e.weightKg }));
  }, [entries, range, now]);

  const latest = entries?.[0] ?? null;
  const earliest = entries && entries.length > 1 ? entries[entries.length - 1] : null;
  const change = latest && earliest ? Math.round((latest.weightKg - earliest.weightKg) * 10) / 10 : null;

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    const r = await api(`/api/progress/${deleting.id}`, { method: "DELETE" });
    setBusy(false);
    setDeleting(null);
    if (r.ok) {
      setEntries((list) => (list ?? []).filter((e) => e.id !== deleting.id));
      show("Entry deleted.", "success");
      void load();
    } else show(r.message, "error");
  };

  return (
    <PageShell
      eyebrow="Progress"
      title="Progress Tracking"
      intro="Record your weight over time and see it next to your nutrition. Only the values you enter are shown — NutriPlan does not predict future weight or promise outcomes."
      badges={
        entries && entries.length > 0 ? (
          <>
            <Badge tone="brand">
              <Scale className="h-3.5 w-3.5" aria-hidden="true" />
              {entries.length} record{entries.length === 1 ? "" : "s"}
            </Badge>
            {latest && <Badge>Latest {latest.weightKg} kg · {formatDay(latest.entryDate)}</Badge>}
          </>
        ) : null
      }
    >
      {status === "error" && (
        <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-card border border-danger-500/30 bg-danger-50/60 p-4 text-sm text-danger-700">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" /> {error}
          </span>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {status === "loading" && entries === null && (
            <div className="space-y-3" aria-busy="true" aria-label="Loading progress">
              <div className="skeleton h-36" />
              <div className="skeleton h-9" />
              <div className="skeleton h-9" />
              <div className="skeleton h-9" />
            </div>
          )}

          {entries && entries.length === 0 && (
            <EmptyState icon={<Scale className="h-6 w-6" aria-hidden="true" />} title="Add your first progress entry to start tracking." description="Record a date, your weight and an optional note. Your history and trend chart build from these entries only." action={<Button onClick={() => setEditing("new")} icon={<Plus className="h-4 w-4" />}>Add entry</Button>} />
          )}

          {entries && entries.length > 0 && (
            <>
              <Card>
                <CardBody>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
                      <TrendingUp className="h-4 w-4 text-brand-500" aria-hidden="true" /> Weight over time
                    </h2>
                    <div role="tablist" aria-label="Range" className="inline-flex rounded-pill border border-line bg-canvas p-1">
                      {([30, 90, 365, 0] as Range[]).map((r) => (
                        <button key={r} role="tab" type="button" aria-selected={range === r} onClick={() => setRange(r)} className={cn("rounded-pill px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300", range === r ? "bg-brand-500 text-white" : "text-muted hover:text-ink")}>
                          {r === 0 ? "All" : r === 365 ? "1y" : `${r}d`}
                        </button>
                      ))}
                    </div>
                  </div>
                  {chartPoints.length === 0 ? (
                    <p className="mt-3 text-sm text-muted">No records in this range.</p>
                  ) : chartPoints.length === 1 ? (
                    <p className="mt-3 text-sm text-muted">
                      One record in this range: <strong className="text-ink">{chartPoints[0].value} kg</strong> on {chartPoints[0].label}. A trend needs at least two records.
                    </p>
                  ) : (
                    <div className="mt-3">
                      <LineChart title="Weight over time" points={chartPoints.length > 14 ? thin(chartPoints, 14) : chartPoints} unit="kg" />
                      {chartPoints.length > 14 && <p className="mt-1 text-[11px] text-muted">Showing {Math.min(14, chartPoints.length)} of {chartPoints.length} records for readability; the history below has all of them.</p>}
                    </div>
                  )}
                  {change !== null && earliest && latest && (
                    <p className="mt-3 text-xs text-muted">
                      Between {formatDay(earliest.entryDate)} and {formatDay(latest.entryDate)}: {change > 0 ? "+" : ""}
                      {change} kg across {entries.length} records.
                    </p>
                  )}
                </CardBody>
              </Card>

              <Card>
                <CardBody>
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-bold text-ink">History</h2>
                    <Button size="sm" onClick={() => setEditing("new")} icon={<Plus className="h-4 w-4" />}>
                      Add entry
                    </Button>
                  </div>
                  <ul className="mt-3 divide-y divide-line">
                    {entries.map((e, i) => {
                      const prev = entries[i + 1];
                      const delta = prev ? Math.round((e.weightKg - prev.weightKg) * 10) / 10 : null;
                      return (
                        <li key={e.id} className="flex items-center gap-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-ink">
                              <span className="font-semibold">{formatDay(e.entryDate)}</span> — <span className="tabular-nums">{e.weightKg} kg</span>
                              {delta !== null && delta !== 0 && (
                                <span className="ml-2 text-xs tabular-nums text-muted">
                                  ({delta > 0 ? "+" : ""}
                                  {delta} kg vs previous)
                                </span>
                              )}
                            </p>
                            {e.note && <p className="truncate text-xs text-muted">{e.note}</p>}
                          </div>
                          <button type="button" onClick={() => setEditing(e)} className="rounded-md p-1.5 text-muted hover:bg-canvas hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300" aria-label={`Edit entry for ${formatDay(e.entryDate)}`}>
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <button type="button" onClick={() => setDeleting(e)} className="rounded-md p-1.5 text-muted hover:bg-danger-50 hover:text-danger-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300" aria-label={`Delete entry for ${formatDay(e.entryDate)}`}>
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </CardBody>
              </Card>
            </>
          )}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardBody>
              <h2 className="text-sm font-bold text-ink">Body metrics</h2>
              {!metrics ? (
                <div className="skeleton mt-3 h-24" />
              ) : (
                <dl className="mt-3 space-y-2 text-sm">
                  <Row label="Current weight" value={metrics.currentWeightKg !== null ? `${metrics.currentWeightKg} kg` : "—"} tag={metrics.currentWeightSource ?? undefined} />
                  <Row label="Height" value={metrics.heightCm !== null ? `${metrics.heightCm} cm` : "—"} tag="Profile" />
                  <Row label="BMI" value={metrics.bmi ? `${metrics.bmi.value} · ${metrics.bmi.categoryLabel}` : "—"} tag="Calculated" />
                </dl>
              )}
              <p className="mt-3 text-[11px] leading-relaxed text-muted">BMI uses the same formula as your nutrition profile and is a screening figure, not a diagnosis.</p>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <h2 className="text-sm font-bold text-ink">Goal context</h2>
              {!metrics ? (
                <div className="skeleton mt-3 h-20" />
              ) : !metrics.goal ? (
                <p className="mt-2 text-sm text-muted">
                  No goal set in your profile.{" "}
                  <Link href="/planner" className="font-semibold text-brand-600 hover:underline">
                    Update profile
                  </Link>
                </p>
              ) : (
                <dl className="mt-3 space-y-2 text-sm">
                  <Row label="Goal" value={labelFor(GOALS, metrics.goal)} tag="Profile" />
                  <Row label="Profile weight" value={metrics.profileWeightKg !== null ? `${metrics.profileWeightKg} kg` : "—"} tag="Profile" />
                  <Row label="Latest recorded" value={latest ? `${latest.weightKg} kg` : "—"} tag="Logged" />
                  {latest && metrics.profileWeightKg !== null && <Row label="Difference" value={`${latest.weightKg - metrics.profileWeightKg > 0 ? "+" : ""}${Math.round((latest.weightKg - metrics.profileWeightKg) * 10) / 10} kg`} tag="Calculated" />}
                </dl>
              )}
              <p className="mt-3 text-[11px] leading-relaxed text-muted">Your profile stores a goal type but no target weight, so no target-weight countdown is shown. No completion date is estimated.</p>
            </CardBody>
          </Card>
        </aside>
      </div>

      <EntryDialog key={editing === "new" ? "new" : (editing?.id ?? "closed")} entry={editing === "new" ? null : editing} open={editing !== null} onClose={() => setEditing(null)} onSaved={(entry, mode) => {
        setEntries((list) => {
          const rest = (list ?? []).filter((e) => e.id !== entry.id);
          return [...rest, entry].sort((a, b) => b.entryDate.localeCompare(a.entryDate));
        });
        show(mode === "create" ? "Entry added." : "Entry updated.", "success");
        void load();
      }} />
      <ConfirmDialog open={deleting !== null} title="Delete this entry?" description={deleting ? `${formatDay(deleting.entryDate)} — ${deleting.weightKg} kg will be removed from your history.` : ""} confirmLabel={busy ? "Deleting…" : "Delete"} tone="danger" onCancel={() => setDeleting(null)} onConfirm={() => void remove()} />
      <Toast toast={toast} onDismiss={dismiss} />
    </PageShell>
  );
}

/** Keep first, last and evenly spaced points in between. */
function thin<T>(points: T[], max: number): T[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}

function Row({ label, value, tag }: { label: string; value: string; tag?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="flex items-center gap-1.5 text-right font-semibold tabular-nums text-ink">
        {value}
        {tag && <span className="rounded-md border border-line bg-canvas px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">{tag}</span>}
      </dd>
    </div>
  );
}

function EntryDialog({ entry, open, onClose, onSaved }: { entry: ProgressEntry | null; open: boolean; onClose: () => void; onSaved: (entry: ProgressEntry, mode: "create" | "edit") => void }) {
  const [date, setDate] = useState(entry?.entryDate ?? toDateKey());
  const [weight, setWeight] = useState(entry ? String(entry.weightKg) : "");
  const [note, setNote] = useState(entry?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const today = toDateKey();

  const submit = async () => {
    const w = Number(weight);
    if (!date) return setError("Choose a date.");
    if (date > today) return setError("The date cannot be in the future.");
    if (!weight || !Number.isFinite(w) || w <= 0) return setError("Enter a weight greater than 0.");
    if (w < 20 || w > 400) return setError("Weight must be between 20 and 400 kg.");
    if (note.length > 200) return setError("Note must be 200 characters or fewer.");
    setError(null);
    setBusy(true);
    const body = JSON.stringify({ entryDate: date, weightKg: w, note: note || null });
    const r = entry ? await api<{ entry: ProgressEntry }>(`/api/progress/${entry.id}`, { method: "PATCH", body }) : await api<{ entry: ProgressEntry }>("/api/progress", { method: "POST", body });
    setBusy(false);
    if (r.ok) {
      onSaved(r.data.entry, entry ? "edit" : "create");
      onClose();
    } else setError(r.message);
  };

  return (
    <Dialog
      open={open}
      title={entry ? "Edit progress entry" : "Add progress entry"}
      description="One entry per date. Weight in kilograms."
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} icon={<X className="h-4 w-4" />}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy} icon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}>
            {entry ? "Save changes" : "Add entry"}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Date" type="date" value={date} onChange={setDate} max={today} required />
        <TextField label="Weight (kg)" type="number" inputMode="decimal" min={20} max={400} step="0.1" value={weight} onChange={setWeight} placeholder="e.g. 68.5" required autoFocus />
        <div className="sm:col-span-2">
          <TextField label="Note (optional)" value={note} onChange={setNote} maxLength={200} placeholder="e.g. morning, before breakfast" />
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-danger-500/30 bg-danger-50/60 px-3 py-2 text-sm text-danger-700">
          {error}
        </p>
      )}
    </Dialog>
  );
}
