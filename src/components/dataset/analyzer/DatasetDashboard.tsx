"use client";

/**
 * Phase 7 — dataset-wide dashboard: totals, status counts, averages (only
 * when enough valid values), distribution charts with text summaries, group
 * comparison (descriptive, no ranking) and an optional AI explanation of the
 * summary statistics. Everything reflects the active filters and is labelled
 * "All records" or "Selected records" accordingly.
 */
import { Loader2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient, toUserMessage } from "@/services/apiClient";
import { Badge, Button, Card, CardBody } from "@/components/ui/core";
import { BarChart } from "@/components/analytics/charts";
import type { Aggregates, Distributions, GroupStats, NumericSummary } from "@/services/server/datasetRecordRepository";

interface StatsResponse {
  dataset: { id: number; displayName: string; recordCount: number };
  scope: "all" | "selected";
  filters: string[];
  minimumForAverages: number;
  aggregates: Aggregates;
  distributions: Distributions;
  groupBy: string;
  groups: GroupStats[];
}

interface Props {
  datasetId: number;
  filterQuery: string;
  refreshKey: number;
  onStats?: (s: StatsResponse) => void;
}

const GROUP_OPTIONS: Array<[string, string]> = [["gender", "Gender"], ["activityLevel", "Activity level"], ["recordStatus", "Record status"], ["nutritionStatus", "Nutrition status"]];

function pct(part: number, total: number) {
  return total ? `${Math.round((part / total) * 100)}%` : "0%";
}

function summaryText(label: string, unit: string, s: NumericSummary, min: number): string {
  if (s.count < min) return `${label}: not enough valid values (${s.count} of ${min} needed).`;
  return `${label}: average ${s.mean}${unit ? " " + unit : ""} across ${s.count} records (range ${s.min}–${s.max}).`;
}

function distributionText(label: string, buckets: Array<{ label: string; count: number }>): string {
  const total = buckets.reduce((a, b) => a + b.count, 0);
  if (total === 0) return `${label}: no valid values to chart.`;
  const top = [...buckets].sort((a, b) => b.count - a.count)[0];
  return `${label}: ${total} values; the most common range is ${top.label} with ${top.count} record${top.count === 1 ? "" : "s"} (${pct(top.count, total)}).`;
}

export function DatasetDashboard({ datasetId, filterQuery, refreshKey, onStats }: Props) {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState("gender");
  const [explain, setExplain] = useState<{ text: string; note: string; source: string } | null>(null);
  const [explaining, setExplaining] = useState(false);
  const seq = useRef(0);
  const onStatsRef = useRef(onStats);
  useEffect(() => { onStatsRef.current = onStats; }, [onStats]);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams(filterQuery);
      q.set("groupBy", groupBy);
      const res = await apiClient.get<StatsResponse>(`/api/datasets/${datasetId}/stats?${q.toString()}`);
      if (mine !== seq.current) return;
      setData(res);
      onStatsRef.current?.(res);
    } catch (err) {
      if (mine === seq.current) setError(toUserMessage(err, "Statistics could not be loaded."));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [datasetId, filterQuery, groupBy]);

  useEffect(() => {
    const t = setTimeout(() => {
      setExplain(null); // a new scope invalidates the previous explanation
      void load();
    }, 0);
    return () => clearTimeout(t);
  }, [load, refreshKey]);

  const runExplain = async () => {
    setExplaining(true);
    try {
      const filters = Object.fromEntries(new URLSearchParams(filterQuery).entries());
      const res = await apiClient.post<{ text: string; note: string; source: string }>(`/api/datasets/${datasetId}/explain`, { filters });
      setExplain(res);
    } catch (err) {
      setExplain({ text: toUserMessage(err, "The explanation could not be generated."), note: "", source: "error" });
    } finally {
      setExplaining(false);
    }
  };

  if (error) return <p role="alert" className="text-sm text-danger-700">{error}</p>;
  if (!data) {
    return (
      <div className="grid gap-3 sm:grid-cols-4" aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-[10px] bg-line/40" />)}
      </div>
    );
  }

  const a = data.aggregates;
  const min = data.minimumForAverages;
  const scopeLabel = data.scope === "selected" ? `Selected records (${a.total.toLocaleString()})` : `All records (${a.total.toLocaleString()})`;
  const enough = a.total >= min;

  const numeric: Array<[string, string, NumericSummary]> = [["Age", "years", a.age], ["Height", "cm", a.heightCm], ["Weight", "kg", a.weightKg], ["BMI", "", a.bmi], ["Calories", "kcal", a.calories], ["Protein", "g", a.protein]];
  const charts: Array<[string, string, keyof Distributions]> = [["Age distribution", "records", "age"], ["Weight distribution", "records", "weightKg"], ["Height distribution", "records", "heightCm"], ["BMI distribution", "records", "bmi"], ["Calorie distribution", "records", "calories"], ["Protein distribution", "records", "protein"]];

  return (
    <div className="space-y-4" aria-busy={loading}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={data.scope === "selected" ? "warning" : "brand"}>{scopeLabel}</Badge>
          {data.filters.map((f) => <Badge key={f} tone="neutral" className="px-2 py-0.5 text-[11px]">{f}</Badge>)}
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted" aria-label="Updating" />}
        </div>
        <Button size="sm" variant="outline" icon={<Sparkles className="h-3.5 w-3.5" aria-hidden="true" />} loading={explaining} disabled={explaining || a.total === 0} onClick={() => void runExplain()}>
          Explain these statistics
        </Button>
      </div>

      {explain && (
        <div className="rounded-[10px] border border-brand-400/30 bg-brand-50/50 p-3 text-sm text-ink" role="status">
          <p className="text-[11px] font-bold uppercase tracking-wide text-brand-400">
            {explain.source === "ai" ? "AI explanation · summary statistics only" : explain.source === "rules" ? "Rule-based summary" : "Notice"}
          </p>
          <p className="mt-1 leading-relaxed">{explain.text}</p>
          {explain.note && <p className="mt-1 text-xs text-muted">{explain.note}</p>}
        </div>
      )}

      {/* Totals */}
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Records", a.total, "neutral"],
          ["Complete", a.recordStatus.complete, "brand"],
          ["Incomplete", a.recordStatus.incomplete, "warning"],
          ["Needs review", a.recordStatus.needs_review, "danger"],
          ["Potential outliers", a.potentialOutliers, "warning"],
          ["Reviewed", a.reviewed, "neutral"],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-[10px] border border-line bg-canvas px-3 py-2">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
            <dd className="text-xl font-bold text-ink">{Number(value).toLocaleString()}</dd>
          </div>
        ))}
      </dl>
      {a.excluded > 0 && <p className="text-xs text-muted">{a.excluded} record{a.excluded === 1 ? " is" : "s are"} excluded from these figures (dataset-wide). Tick “Include excluded records” in the filters to see them.</p>}

      {/* Averages */}
      <Card>
        <CardBody>
          <h3 className="text-sm font-bold text-ink">Averages — {scopeLabel}</h3>
          {!enough ? (
            <p className="mt-1 text-xs text-muted">Averages are shown once at least {min} records with valid values are in scope (currently {a.total}).</p>
          ) : (
            <>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {numeric.map(([label, unit, s]) => (
                  <div key={label} className="rounded-[10px] border border-line px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
                    {s.count < min ? (
                      <p className="text-xs text-muted">Not enough valid values ({s.count}/{min})</p>
                    ) : (
                      <>
                        <p className="text-lg font-bold text-ink">{s.mean}{unit ? <span className="text-xs font-normal text-muted"> {unit}</span> : null}</p>
                        <p className="text-[11px] text-muted">n={s.count} · range {s.min}–{s.max}</p>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <ul className="sr-only">{numeric.map(([label, unit, s]) => <li key={label}>{summaryText(label, unit, s, min)}</li>)}</ul>
            </>
          )}
          <p className="mt-2 text-[11px] text-muted">BMI = weight (kg) ÷ height (m)², the same method used in personal analytics. Categories are screening ranges, not a diagnosis.</p>
        </CardBody>
      </Card>

      {/* Nutrition status */}
      {a.total - a.nutritionStatus.not_assessable > 0 && (
        <Card>
          <CardBody>
            <h3 className="text-sm font-bold text-ink">Potential gap based on recorded data — calories vs calculated reference</h3>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {([["below_target", "Below target"], ["adequate", "Adequate"], ["above_reference", "Above reference"], ["not_assessable", "Not assessable"]] as const).map(([k, l]) => (
                <div key={k} className="rounded-[10px] border border-line px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{l}</p>
                  <p className="text-lg font-bold text-ink">{a.nutritionStatus[k]} <span className="text-xs font-normal text-muted">({pct(a.nutritionStatus[k], a.total)})</span></p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted">The reference is calculated per record from age, height, weight and activity with the same energy model used for personal plans. “Not assessable” records lack one of those values or recorded calories.</p>
          </CardBody>
        </Card>
      )}

      {/* Distributions */}
      <Card>
        <CardBody>
          <h3 className="text-sm font-bold text-ink">Distributions — {scopeLabel}</h3>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {charts.map(([title, unit, key]) => {
              const buckets = data.distributions[key];
              const total = buckets.reduce((s, b) => s + b.count, 0);
              return (
                <div key={key}>
                  <p className="text-xs font-semibold text-ink">{title}</p>
                  {total === 0 ? (
                    <p className="mt-1 text-xs text-muted">No valid values to chart.</p>
                  ) : (
                    <BarChart title={title} unit={unit} points={buckets.map((b) => ({ label: b.label, value: b.count }))} height={120} />
                  )}
                  <p className="mt-1 text-[11px] text-muted">{distributionText(title.replace(" distribution", ""), buckets)}</p>
                </div>
              );
            })}
          </div>
        </CardBody>
      </Card>

      {/* Group comparison */}
      <Card>
        <CardBody>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-ink">Group comparison — {scopeLabel}</h3>
            <label className="text-xs text-muted">
              Compare by{" "}
              <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className="rounded border border-line bg-surface px-2 py-1 text-xs text-ink">
                {GROUP_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          </div>
          {data.groups.length === 0 ? (
            <p className="mt-1 text-xs text-muted">No groups to compare.</p>
          ) : (
            <div className="mt-2 table-scroll rounded-[10px] border border-line">
              <table className="w-full min-w-[520px] text-left text-xs">
                <caption className="sr-only">Descriptive averages per group; groups are listed by size, not ranked.</caption>
                <thead className="bg-canvas text-[11px] uppercase tracking-wide text-muted">
                  <tr>
                    <th scope="col" className="px-3 py-2">Group</th>
                    <th scope="col" className="px-3 py-2 text-right">Records</th>
                    <th scope="col" className="px-3 py-2 text-right">Avg age</th>
                    <th scope="col" className="px-3 py-2 text-right">Avg BMI</th>
                    <th scope="col" className="px-3 py-2 text-right">Avg calories</th>
                    <th scope="col" className="px-3 py-2 text-right">Avg protein</th>
                  </tr>
                </thead>
                <tbody>
                  {data.groups.map((g) => {
                    const small = g.count < min;
                    const v = (x: number | null) => (small || x === null ? "—" : x);
                    return (
                      <tr key={g.label} className="border-t border-line">
                        <th scope="row" className="px-3 py-1.5 font-semibold text-ink">{g.label.replace(/_/g, " ")}{small && <span className="ml-1 font-normal text-muted">(too few for averages)</span>}</th>
                        <td className="px-3 py-1.5 text-right tabular-nums">{g.count}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{v(g.age)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{v(g.bmi)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{v(g.calories)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{v(g.protein)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-[11px] text-muted">Descriptive comparison only — groups are not ranked and no individual is highlighted.</p>
        </CardBody>
      </Card>
    </div>
  );
}

export type { StatsResponse };
