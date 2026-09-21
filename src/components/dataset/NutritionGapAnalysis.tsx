"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, CheckCircle2, ChevronDown, Search, ShieldCheck, TrendingDown } from "lucide-react";
import { apiClient, toUserMessage } from "@/services/apiClient";
import { Badge, Card, CardBody } from "@/components/ui/core";
import type { DatasetNutritionAnalysis, NutrientAssessment, ParticipantNutritionAnalysis } from "@/services/dataset/nutritionGapAnalysis";

interface Props { datasetId: number | null; }

const severityTone: Record<string, string> = {
  adequate: "border-brand-400/25 bg-brand-50 text-brand-400",
  mild: "border-accent-300 bg-accent-100 text-accent-700",
  moderate: "border-orange-300 bg-orange-50 text-orange-700",
  significant: "border-danger-200 bg-danger-50 text-danger-700",
  not_assessable: "border-line bg-canvas text-muted",
};

function value(value: number | null, unit: string) {
  return value === null ? "Not available" : `${value} ${unit}`;
}

function statusLabel(status: NutrientAssessment["status"]) {
  return {
    adequate: "Adequate",
    below_target: "Below target",
    above_reference: "Above reference",
    significantly_below: "Significantly below",
    significantly_above: "Significantly above",
    not_assessable: "Not assessable",
  }[status];
}

function AssessmentRow({ item }: { item: NutrientAssessment }) {
  const gap = item.difference === null ? null : Math.abs(item.difference);
  return (
    <tr className="border-t border-line/70 align-top">
      <td className="px-3 py-3 font-semibold text-ink">{item.label}</td>
      <td className="px-3 py-3 text-ink">{value(item.actual, item.unit)}</td>
      <td className="px-3 py-3 text-muted">{item.target === null ? "Not available in this methodology" : value(item.target, item.unit)}</td>
      <td className="px-3 py-3 text-muted">{gap === null ? "—" : `${item.difference! < 0 ? "-" : "+"}${gap} ${item.unit}`}</td>
      <td className="px-3 py-3"><span className={`inline-flex rounded-pill border px-2 py-1 text-[11px] font-bold ${severityTone[item.severity]}`}>{statusLabel(item.status)}</span></td>
      <td className="px-3 py-3 text-xs text-muted">{item.percentageOfTarget === null ? "—" : `${item.percentageOfTarget}% of target`}</td>
    </tr>
  );
}

function ParticipantReport({ participant }: { participant: ParticipantNutritionAnalysis }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-brand-400">Participant report</p>
          <h3 className="mt-1 text-xl font-bold text-ink">{participant.name || "Unnamed participant"}</h3>
          <p className="mt-1 text-xs text-muted">ID {participant.participantId} · {participant.age ?? "Age unavailable"} years · {participant.gender || "Gender unavailable"} · {participant.activity || "Activity unavailable"}</p>
        </div>
        <Badge tone={participant.qualityStatus === "clean" ? "brand" : "warning"}>{participant.qualityStatus.replace("_", " ")}</Badge>
      </div>

      <p className="rounded-[10px] border border-line bg-canvas px-4 py-3 text-sm leading-relaxed text-ink">{participant.summary}</p>

      {participant.gaps.length > 0 && (
        <section>
          <h4 className="flex items-center gap-2 text-sm font-bold text-ink"><TrendingDown className="h-4 w-4 text-danger-600" aria-hidden="true" />Top nutritional gaps and excesses</h4>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            {participant.gaps.slice(0, 3).map((item) => (
              <div key={item.key} className={`rounded-[10px] border p-3 ${severityTone[item.severity]}`}>
                <p className="text-sm font-bold">{item.label}</p>
                <p className="mt-1 text-xs">{item.difference === null ? "Not assessable" : item.difference < 0 ? `${Math.abs(item.difference)} ${item.unit} below target` : `${item.difference} ${item.unit} above reference`}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {participant.strengths.length > 0 && (
        <section>
          <h4 className="flex items-center gap-2 text-sm font-bold text-ink"><CheckCircle2 className="h-4 w-4 text-brand-400" aria-hidden="true" />What this person is doing well</h4>
          <p className="mt-2 text-sm text-muted">{participant.strengths.map((item) => item.label).join(", ")}</p>
        </section>
      )}

      <section>
        <h4 className="text-sm font-bold text-ink">Nutrient details</h4>
        <div className="mt-2 overflow-x-auto rounded-[10px] border border-line">
          <table className="w-full min-w-[720px] border-collapse text-xs">
            <thead className="bg-canvas text-left text-muted"><tr><th className="px-3 py-2">Nutrient</th><th className="px-3 py-2">Actual</th><th className="px-3 py-2">Target / reference</th><th className="px-3 py-2">Difference</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Coverage</th></tr></thead>
            <tbody>{participant.nutrients.map((item) => <AssessmentRow key={item.key} item={item} />)}</tbody>
          </table>
        </div>
      </section>

      {(participant.gaps.some((item) => item.explanation) || participant.gaps.some((item) => item.recommendations.length > 0)) && (
        <section className="grid gap-4 md:grid-cols-2">
          <div>
            <h4 className="flex items-center gap-2 text-sm font-bold text-ink"><AlertTriangle className="h-4 w-4 text-accent-300" aria-hidden="true" />Why might this be happening?</h4>
            <ul className="mt-2 space-y-2 text-sm leading-relaxed text-muted">{participant.gaps.slice(0, 4).map((item) => <li key={item.key}><strong className="text-ink">{item.label}:</strong> {item.explanation}</li>)}</ul>
          </div>
          <div>
            <h4 className="flex items-center gap-2 text-sm font-bold text-ink"><ShieldCheck className="h-4 w-4 text-brand-400" aria-hidden="true" />Data-based suggestions</h4>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted">{participant.gaps.flatMap((item) => item.recommendations).slice(0, 6).map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        </section>
      )}

      <section>
        <h4 className="text-sm font-bold text-ink">Meal evidence</h4>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">{participant.mealAnalysis.map((meal) => <div key={meal.meal} className="rounded-[10px] border border-line bg-canvas p-3"><p className="text-xs font-bold capitalize text-ink">{meal.meal}</p><p className="mt-1 text-xs text-muted">{meal.foods.length ? meal.foods.join(", ") : "No recorded foods"}</p></div>)}</div>
      </section>

      {participant.qualityIssues.length > 0 && <p className="text-xs text-muted">Quality notes: {participant.qualityIssues.join(" ")}</p>}
    </div>
  );
}

export function NutritionGapAnalysis({ datasetId }: Props) {
  const [analysis, setAnalysis] = useState<DatasetNutritionAnalysis | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (datasetId === null) {
      // Dataset selection changes are external API state, not personal profile state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAnalysis(null);
      return;
    }
    setLoading(true); setError(null);
    void apiClient.get<{ analysis: DatasetNutritionAnalysis }>(`/api/datasets/${datasetId}/analysis`)
      .then((data) => { setAnalysis(data.analysis); setSelectedId(data.analysis.participants[0]?.participantId ?? null); })
      .catch((err) => setError(toUserMessage(err, "The dataset analysis could not be loaded.")))
      .finally(() => setLoading(false));
  }, [datasetId]);

  const filtered = useMemo(() => {
    if (!analysis) return [];
    const needle = query.trim().toLowerCase();
    return analysis.participants.filter((participant) => {
      const matchesText = !needle || participant.name.toLowerCase().includes(needle) || participant.participantId.toLowerCase().includes(needle);
      const matchesFilter = filter === "all" || (filter === "needs_review" && participant.qualityStatus !== "clean") || participant.gaps.some((gap) => gap.key === filter && gap.status !== "adequate" && gap.status !== "not_assessable");
      return matchesText && matchesFilter;
    });
  }, [analysis, filter, query]);

  const selected = analysis?.participants.find((participant) => participant.participantId === selectedId) ?? filtered[0] ?? null;
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visibleParticipants = filtered.slice((page - 1) * pageSize, page * pageSize);

  if (datasetId === null) return <Card><CardBody><p className="text-sm text-muted">Choose <strong>Analyze dataset</strong> on an uploaded dataset to see participant reports and nutritional gaps.</p></CardBody></Card>;
  if (loading) return <Card><CardBody><p className="text-sm text-muted">Analyzing validated records…</p></CardBody></Card>;
  if (error) return <Card><CardBody><p role="alert" className="text-sm text-danger-700">{error}</p></CardBody></Card>;
  if (!analysis) return null;

  return (
    <Card className="mt-6">
      <CardBody className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-wide text-brand-400">Nutrition gap analysis</p><h2 className="mt-1 text-xl font-bold text-ink">What the uploaded data shows</h2><p className="mt-1 text-sm text-muted">Actual records only. Missing reference targets remain clearly marked as not assessable.</p></div>
          <BarChart3 className="h-6 w-6 text-brand-400" aria-hidden="true" />
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <Metric label="Total participants" value={analysis.totalParticipants} />
          <Metric label="Analyzed" value={analysis.analyzedParticipants} />
          <Metric label="Complete nutrition" value={analysis.completeNutritionParticipants} />
          <Metric label="Commonest gap" value={analysis.commonGap ? `${analysis.commonGap.label} (${analysis.commonGap.percentage}%)` : "None identified"} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{analysis.averages.map((item) => <Metric key={item.label} label={`Average ${item.label}`} value={item.value === null ? "Not available" : `${item.value} ${item.unit}`} detail={`${item.count} records with data`} />)}</div>
        <div className="rounded-[10px] border border-line bg-canvas p-4"><h3 className="text-sm font-bold text-ink">Student records</h3><div className="mt-3 flex flex-col gap-2 sm:flex-row"><div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search ID or name" className="h-10 w-full rounded-[10px] border border-line bg-surface pl-9 pr-3 text-sm" /></div><select value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1); }} className="h-10 rounded-[10px] border border-line bg-surface px-3 text-sm"><option value="all">All participants</option><option value="needs_review">Needs review</option>{analysis.participants[0]?.nutrients.map((nutrient) => <option key={nutrient.key} value={nutrient.key}>{nutrient.label} needs review</option>)}</select></div><div className="mt-3 overflow-x-auto rounded-[10px] border border-line bg-surface"><table className="w-full min-w-[700px] border-collapse text-xs"><thead className="bg-canvas text-left text-muted"><tr><th className="px-3 py-2">ID</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Age</th><th className="px-3 py-2">Calories</th><th className="px-3 py-2">Protein</th><th className="px-3 py-2">Fibre</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" /></tr></thead><tbody>{visibleParticipants.map((participant) => { const calories = participant.nutrients.find((item) => item.key === "caloriesKcal"); const protein = participant.nutrients.find((item) => item.key === "proteinG"); const fibre = participant.nutrients.find((item) => item.key === "dietaryFibreG"); return <tr key={participant.participantId} className={`border-t border-line/70 ${selectedId === participant.participantId ? "bg-brand-50" : ""}`}><td className="px-3 py-2 font-semibold text-ink">{participant.participantId || "—"}</td><td className="px-3 py-2 text-ink">{participant.name || "Unnamed"}</td><td className="px-3 py-2 text-muted">{participant.age ?? "—"}</td><td className="px-3 py-2 text-muted">{calories?.actual ?? "—"}</td><td className="px-3 py-2 text-muted">{protein?.actual ?? "—"}</td><td className="px-3 py-2 text-muted">{fibre?.actual ?? "—"}</td><td className="px-3 py-2"><span className={`rounded-pill border px-2 py-1 text-[11px] font-semibold ${severityTone[participant.gaps[0]?.severity ?? "not_assessable"]}`}>{participant.qualityStatus === "clean" ? (participant.gaps.length ? "Needs review" : "Adequate") : participant.qualityStatus.replace("_", " ")}</span></td><td className="px-3 py-2"><button type="button" onClick={() => setSelectedId(participant.participantId)} className="font-semibold text-brand-400 hover:underline">View</button></td></tr>; })}</tbody></table></div><div className="mt-3 flex items-center justify-between text-xs text-muted"><span>{filtered.length} matching student(s)</span><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className="rounded border border-line px-2 py-1 disabled:opacity-40">Previous</button><span className="px-2 py-1">Page {page} of {pageCount}</span><button type="button" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)} className="rounded border border-line px-2 py-1 disabled:opacity-40">Next</button></div></div></div>
        {selected && <ParticipantReport participant={selected} />}
        <details className="rounded-[10px] border border-line p-4"><summary className="cursor-pointer text-sm font-bold text-ink">How the analysis is calculated</summary><ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-relaxed text-muted">{analysis.methodology.map((item) => <li key={item}>{item}</li>)}</ul></details>
      </CardBody>
    </Card>
  );
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return <div className="rounded-[10px] border border-line bg-surface p-3"><p className="text-xs text-muted">{label}</p><p className="mt-1 break-words text-lg font-bold text-ink">{value}</p>{detail && <p className="mt-1 text-[11px] text-muted">{detail}</p>}</div>;
}
