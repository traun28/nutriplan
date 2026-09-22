"use client";

/**
 * Phase 5 — Nutrition analytics page: Daily | Weekly.
 *
 * Daily: targets vs estimated intake, gap/strength/excess analysis with
 * meal + food contributions and restriction-safe food suggestions, a
 * transparent daily score, planned-vs-actual (Phase 3 × Phase 2),
 * today-vs-yesterday, water, and a few factual insights.
 * Weekly: per-day charts (gaps where nothing was logged), averages over
 * logged days, week-vs-week, weight points and weekly insights.
 *
 * All numbers come from /api/analytics — nothing is computed here.
 */
import { AlertTriangle, ArrowRight, BarChart3, CalendarDays, ChevronLeft, ChevronRight, Droplets, Info, ListChecks, Loader2, NotebookPen, Scale, Sparkles, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDayLog } from "@/context/DayLogContext";
import { Badge, Button, Card, CardBody, EmptyState } from "@/components/ui/core";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { BarChart, LineChart, ScoreRing, ShareBars } from "@/components/analytics/charts";
import { PageShell } from "@/components/recipes/recipeUi";
import { shiftDateKey, toDateKey } from "@/services/foodLog/calculations";
import { formatLitres } from "@/services/foodLog/water";
import type { DailyAnalytics, WeeklyAnalytics } from "@/services/analytics/clientTypes";
import type { GapStatus, NutrientAssessment } from "@/services/analytics/nutritionAnalysis";
import type { Insight } from "@/services/analytics/insights";
import { cn } from "@/lib/cn";

type View = "day" | "week";

const STATUS_META: Record<GapStatus, { label: string; tone: "brand" | "warning" | "neutral" | "danger" }> = {
  gap: { label: "Potential gap", tone: "warning" },
  on_target: { label: "Within target", tone: "brand" },
  excess: { label: "Above target", tone: "neutral" },
  no_target: { label: "No target", tone: "neutral" },
  no_data: { label: "Not available", tone: "neutral" },
};

function formatDay(key: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, opts);
}

function num(v: number | null, unit = "", fallback = "—"): string {
  if (v === null) return fallback;
  const n = Number.isInteger(v) ? v.toLocaleString() : v.toFixed(1);
  return unit ? `${n} ${unit}` : n;
}

function SourceTag({ children }: { children: string }) {
  return <span className="rounded-md border border-line bg-canvas px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">{children}</span>;
}

export function NutritionAnalytics({ initialView = "day" }: { initialView?: View }) {
  const dayLog = useDayLog();
  const [view, setView] = useState<View>(initialView);
  const [date, setDate] = useState(() => toDateKey());
  const [daily, setDaily] = useState<DailyAnalytics | null>(null);
  const [weekly, setWeekly] = useState<WeeklyAnalytics | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const today = toDateKey();
  const isToday = date === today;

  // Re-fetch when the Phase 2 log for the open day changes (entries/water).
  const logVersion = `${dayLog.entries.length}:${dayLog.water.length}:${dayLog.selectedDate}`;

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setStatus("loading");
      try {
        const q = new URLSearchParams({ view, date, today, hour: String(new Date().getHours()) });
        const r = await fetch(`/api/analytics?${q}`, { credentials: "same-origin", signal });
        const payload = (await r.json()) as (DailyAnalytics | WeeklyAnalytics) & { error?: string };
        if (!r.ok) throw new Error(payload.error ?? "The analysis could not be loaded.");
        if (view === "day") setDaily(payload as DailyAnalytics);
        else setWeekly(payload as WeeklyAnalytics);
        setError(null);
        setStatus("ready");
      } catch (e) {
        if (signal?.aborted) return;
        setError(e instanceof Error ? e.message : "The analysis could not be loaded.");
        setStatus("error");
      }
    },
    [view, date, today],
  );

  useEffect(() => {
    const controller = new AbortController();
    // Deferred so no state update runs synchronously inside the effect body;
    // logVersion is read so the analysis refreshes after logging changes.
    const timer = setTimeout(() => void load(controller.signal), logVersion ? 0 : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [load, logVersion]);

  const step = view === "day" ? 1 : 7;

  return (
    <PageShell
      eyebrow="Nutrition intelligence"
      title="Nutrition Analytics"
      intro="How your logged intake compares with your configured targets — potential gaps, strengths, where each nutrient came from, planned vs actual, and weekly trends. Estimates are based on the foods you logged; this is not a medical assessment."
      badges={
        <>
          <Badge>
            <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
            {view === "day" ? "Daily view" : "Weekly view"}
          </Badge>
          {daily && view === "day" && daily.hasTargets && <Badge tone="brand">Target {daily.targets.calories?.toLocaleString()} kcal/day</Badge>}
        </>
      }
    >
      {/* View + date controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface p-3 shadow-sm">
        <div role="tablist" aria-label="Analytics view" className="inline-flex rounded-pill border border-line bg-canvas p-1">
          {(["day", "week"] as const).map((v) => (
            <button
              key={v}
              role="tab"
              type="button"
              aria-selected={view === v}
              aria-controls={`panel-${v}`}
              id={`tab-${v}`}
              onClick={() => setView(v)}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft" || e.key === "ArrowRight") setView(v === "day" ? "week" : "day");
              }}
              className={cn(
                "rounded-pill px-4 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300",
                view === v ? "bg-brand-500 text-white shadow-sm" : "text-muted hover:text-ink",
              )}
            >
              {v === "day" ? "Daily" : "Weekly"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" aria-label={view === "day" ? "Previous day" : "Previous week"} onClick={() => setDate((d) => shiftDateKey(d, -step))} icon={<ChevronLeft className="h-4 w-4" />} />
          <label className="sr-only" htmlFor="an-date">
            Date
          </label>
          <input
            id="an-date"
            type="date"
            value={date}
            max={today}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="rounded-[10px] border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15"
          />
          <Button size="sm" variant="ghost" aria-label={view === "day" ? "Next day" : "Next week"} disabled={date >= today} onClick={() => setDate((d) => (shiftDateKey(d, step) > today ? today : shiftDateKey(d, step)))} icon={<ChevronRight className="h-4 w-4" />} />
          {!isToday && (
            <Button size="sm" variant="outline" onClick={() => setDate(today)} icon={<CalendarDays className="h-3.5 w-3.5" />}>
              Today
            </Button>
          )}
        </div>
      </div>

      <p className="mt-3 text-sm text-muted" aria-live="polite">
        {view === "day" ? formatDay(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : weekly ? `Week of ${formatDay(weekly.range.start)} – ${formatDay(weekly.range.end)}` : ""}
        {status === "loading" && (
          <span className="ml-2 inline-flex items-center gap-1 text-xs">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Updating…
          </span>
        )}
      </p>

      {status === "error" && (
        <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-card border border-danger-500/30 bg-danger-50/60 p-4 text-sm text-danger-700">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" /> {error}
          </span>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      )}

      <div id="panel-day" role="tabpanel" aria-labelledby="tab-day" hidden={view !== "day"} className="mt-5">
        {view === "day" && (daily ? <DailyView data={daily} loading={status === "loading"} isToday={isToday} /> : status !== "error" && <Skeleton />)}
      </div>
      <div id="panel-week" role="tabpanel" aria-labelledby="tab-week" hidden={view !== "week"} className="mt-5">
        {view === "week" && (weekly ? <WeeklyView data={weekly} loading={status === "loading"} /> : status !== "error" && <Skeleton />)}
      </div>
    </PageShell>
  );
}

function Skeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]" aria-busy="true" aria-label="Loading analysis">
      <div className="space-y-5">
        <div className="skeleton h-40" />
        <div className="skeleton h-64" />
        <div className="skeleton h-48" />
      </div>
      <div className="space-y-5">
        <div className="skeleton h-40" />
        <div className="skeleton h-56" />
      </div>
    </div>
  );
}

/* ================================ DAILY ================================ */

function DailyView({ data, loading, isToday }: { data: DailyAnalytics; loading: boolean; isToday: boolean }) {
  const [nutrient, setNutrient] = useState<string>("protein");
  const [showAllInsights, setShowAllInsights] = useState(false);
  const selected = data.nutrients.find((n) => n.key === nutrient) ?? data.nutrients[0];
  const selectedAssessment = data.assessments.find((a) => a.key === nutrient);
  const gaps = data.assessments.filter((a) => a.status === "gap");
  const strengths = data.assessments.filter((a) => a.status === "on_target");
  const excesses = data.assessments.filter((a) => a.status === "excess");

  if (data.entryCount === 0) {
    return (
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <EmptyState
          icon={<NotebookPen className="h-6 w-6" aria-hidden="true" />}
          title="No nutrition analysis is available for this day yet."
          description={isToday ? "Log what you eat on the dashboard and the gap analysis, contributions and score will appear here." : "Nothing was logged on this date."}
          action={
            <Button href="/dashboard" icon={<ArrowRight className="h-4 w-4" />}>
              {isToday ? "Log food on the dashboard" : "Open the dashboard"}
            </Button>
          }
        />
        <div className="space-y-5">
          <PlannedCard data={data} />
          <WaterCard data={data} />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("grid gap-5 lg:grid-cols-[1fr_320px]", loading && "opacity-70 transition-opacity")}>
      <div className="space-y-5">
        {/* Target vs estimated */}
        <Card>
          <CardBody>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-ink">Target vs estimated intake</h2>
              <div className="flex gap-1.5">
                <SourceTag>Estimated</SourceTag>
                <SourceTag>Target</SourceTag>
              </div>
            </div>
            {!data.hasTargets && (
              <p className="mt-2 rounded-lg border border-accent-300/40 bg-accent-200/30 px-3 py-2 text-xs text-ink">
                No calculated targets yet — differences and the score need them.{" "}
                <Link href="/nutrition" className="font-semibold text-brand-600 hover:underline">
                  Calculate your nutrition
                </Link>
                .
              </p>
            )}
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {data.assessments.map((a) => (
                <li key={a.key} className="card-hover rounded-[10px] border border-line bg-canvas p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-medium text-muted">{a.label}</span>
                    <Badge tone={STATUS_META[a.status].tone}>{STATUS_META[a.status].label}</Badge>
                  </div>
                  <p className="mt-1 text-lg font-bold tabular-nums text-ink">
                    {a.estimated === null ? <span className="text-sm font-medium italic text-muted">Information not available</span> : a.estimated.toLocaleString()}
                    {a.estimated !== null && <span className="text-sm font-medium text-muted"> / {a.target === null ? "no target" : `${a.target.toLocaleString()} ${a.unit}`}</span>}
                  </p>
                  {a.estimated !== null && a.target !== null && (
                    <>
                      <ProgressBar value={a.estimated} target={a.target} label={a.label} unit={a.unit} size="sm" className="mt-2" barClass={a.status === "gap" ? "bg-accent-400" : a.status === "excess" ? "bg-danger-500/70" : "bg-brand-600"} />
                      <p className="mt-1 text-[11px] text-muted">
                        {a.percentOfTarget}% of target · {a.difference !== null && a.difference >= 0 ? `${a.difference} ${a.unit} below` : `${Math.abs(a.difference ?? 0)} ${a.unit} above`}
                      </p>
                    </>
                  )}
                  {a.key === "fiber" && <p className="mt-1 text-[11px] text-muted">The food database has no fibre values, so fibre cannot be estimated.</p>}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        {/* Gap analysis */}
        <Card>
          <CardBody>
            <h2 className="text-sm font-bold text-ink">Nutrition gap analysis</h2>
            <p className="mt-0.5 text-xs text-muted">Based on foods logged so far compared with your configured targets (±10% counts as within target). This does not diagnose a deficiency.</p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <GapColumn title="Potential gaps" items={gaps} tone="warning" empty="No nutrient is more than 10% below target." />
              <GapColumn title="Strengths" items={strengths} tone="brand" empty="No nutrient is within ±10% of target yet." />
              <GapColumn title="Above target" items={excesses} tone="neutral" empty="No nutrient is more than 10% above target." />
            </div>

            {gaps.length > 0 && (
              <div className="mt-4 space-y-3">
                {gaps.map((g) => {
                  const detail = data.nutrients.find((n) => n.key === g.key);
                  return (
                    <details key={g.key} className="group rounded-[10px] border border-line bg-canvas p-3 open:bg-surface">
                      <summary className="cursor-pointer list-none text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300">
                        <span className="flex flex-wrap items-center justify-between gap-2">
                          <span>
                            {g.label}: estimated {num(g.estimated, g.unit)} · target {num(g.target, g.unit)} · difference {num(g.difference, g.unit)}
                          </span>
                          <span className="text-xs font-medium text-brand-600 group-open:hidden">Details</span>
                        </span>
                      </summary>
                      <div className="mt-3 grid gap-4 sm:grid-cols-2">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Foods contributing so far</p>
                          {detail && detail.foods.length > 0 ? <div className="mt-2"><ShareBars rows={detail.foods.map((f) => ({ label: f.foodName, sublabel: f.mealLabel, amount: f.amount, share: f.share }))} unit={g.unit} /></div> : <p className="mt-1 text-sm text-muted">None logged.</p>}
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Possible food choices</p>
                          {detail && detail.suggestions.length > 0 ? (
                            <ul className="mt-2 space-y-1.5 text-sm">
                              {detail.suggestions.map((s) => (
                                <li key={s.foodId} className="flex items-baseline justify-between gap-2">
                                  <Link href={`/recipes/${s.foodId}`} className="min-w-0 truncate text-ink hover:text-brand-600">
                                    {s.name}
                                  </Link>
                                  <span className="shrink-0 text-xs tabular-nums text-muted">
                                    +{s.amount} {g.unit} · {s.calories} kcal
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-1 text-sm text-muted">No suitable foods found in the database for your restrictions.</p>
                          )}
                          <p className="mt-2 text-[11px] text-muted">Suggestions come from the shared food database, filtered by your dietary type, allergies and dislikes. They are options, not medical advice.</p>
                        </div>
                      </div>
                    </details>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>

        {/* Contributions */}
        <Card>
          <CardBody>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-ink">Where it came from</h2>
              <div role="tablist" aria-label="Nutrient" className="inline-flex flex-wrap gap-1 rounded-pill border border-line bg-canvas p-1">
                {data.nutrients.map((n) => {
                  const a = data.assessments.find((x) => x.key === n.key)!;
                  return (
                    <button key={n.key} role="tab" type="button" aria-selected={nutrient === n.key} onClick={() => setNutrient(n.key)} className={cn("rounded-pill px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300", nutrient === n.key ? "bg-brand-500 text-white" : "text-muted hover:text-ink")}>
                      {a.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {selected && selectedAssessment && (
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">By meal</p>
                  {selected.explanation && <p className="mt-1 text-sm text-ink">{selected.explanation}</p>}
                  <div className="mt-2">
                    <ShareBars rows={selected.meals.map((m) => ({ label: m.mealLabel, amount: m.amount, share: m.share }))} unit={selectedAssessment.unit} />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">Top foods</p>
                  <div className="mt-2">
                    <ShareBars rows={selected.foods.map((f) => ({ label: f.foodName, sublabel: f.mealLabel, amount: f.amount, share: f.share }))} unit={selectedAssessment.unit} />
                  </div>
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        <PlannedCard data={data} />

        {/* Comparison */}
        <Card>
          <CardBody>
            <h2 className="text-sm font-bold text-ink">{data.comparison.label}</h2>
            <p className="mt-0.5 text-xs text-muted">Yesterday: {formatDay(data.comparison.previousDate)}. Rows show “—” where a day has no entries.</p>
            {data.comparison.rows ? <ComparisonTable rows={data.comparison.rows} currentLabel={isToday ? "Today" : "This day"} previousLabel="Yesterday" /> : <p className="mt-3 text-sm text-muted">Nothing logged on either day to compare.</p>}
          </CardBody>
        </Card>
      </div>

      <aside className="space-y-5">
        {/* Score */}
        <Card>
          <CardBody>
            <h2 className="text-sm font-bold text-ink">Daily nutrition score</h2>
            {data.score.available ? (
              <>
                <div className="mt-3 flex items-center gap-4">
                  <ScoreRing value={data.score.total} label="Daily nutrition score" />
                  <p className="text-xs leading-relaxed text-muted">A target-adherence and logging-completeness figure, not a health rating.</p>
                </div>
                <details className="mt-3 text-xs">
                  <summary className="cursor-pointer font-semibold text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300">Your score is calculated from…</summary>
                  <ul className="mt-2 space-y-1.5">
                    {data.score.components.map((c) => (
                      <li key={c.key} className="flex items-baseline justify-between gap-2">
                        <span className="text-ink">
                          {c.label} <span className="text-muted">· {c.detail}</span>
                        </span>
                        <span className="shrink-0 tabular-nums text-muted">
                          {c.points}/{c.max}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-muted">Full marks for a nutrient within ±10% of target, falling to zero at ±50%.</p>
                </details>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted">{data.hasTargets ? "Log at least one food to see a score." : "Calculate your nutrition targets to enable the score."}</p>
            )}
          </CardBody>
        </Card>

        {/* Insights */}
        <Card>
          <CardBody>
            <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
              <Sparkles className="h-4 w-4 text-brand-500" aria-hidden="true" /> Insights
            </h2>
            <InsightList insights={data.insights} showAll={showAllInsights} onToggle={() => setShowAllInsights((s) => !s)} />
          </CardBody>
        </Card>

        <WaterCard data={data} />

        <Card>
          <CardBody>
            <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
              <Scale className="h-4 w-4 text-brand-500" aria-hidden="true" /> Progress tracking
            </h2>
            <p className="mt-1 text-xs text-muted">Record your weight and see it alongside your weekly nutrition.</p>
            <Button href="/progress" size="sm" variant="outline" className="mt-3" icon={<ArrowRight className="h-3.5 w-3.5" />}>
              Open progress
            </Button>
          </CardBody>
        </Card>
      </aside>
    </div>
  );
}

function GapColumn({ title, items, tone, empty }: { title: string; items: NutrientAssessment[]; tone: "brand" | "warning" | "neutral"; empty: string }) {
  return (
    <div className="rounded-[10px] border border-line bg-canvas p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-muted">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {items.map((a) => (
            <li key={a.key} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-ink">{a.label}</span>
              <Badge tone={tone}>{a.percentOfTarget}%</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PlannedCard({ data }: { data: DailyAnalytics }) {
  const pva = data.plannedVsActual;
  return (
    <Card>
      <CardBody>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
            <ListChecks className="h-4 w-4 text-brand-500" aria-hidden="true" /> Planned vs actual
          </h2>
          <div className="flex gap-1.5">
            <SourceTag>Planned</SourceTag>
            <SourceTag>Logged</SourceTag>
          </div>
        </div>
        {!data.plan ? (
          <p className="mt-2 text-sm text-muted">
            Create a meal plan to compare planned and actual nutrition.{" "}
            <Link href="/meal-plan" className="font-semibold text-brand-600 hover:underline">
              Open the planner
            </Link>
          </p>
        ) : !pva ? (
          <p className="mt-2 text-sm text-muted">This date is outside “{data.plan.name}”, so there is nothing planned to compare.</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-ink">
              <strong>
                {pva.loggedCount} of {pva.plannedCount}
              </strong>{" "}
              planned meals logged ({pva.loggingPercent}%). Unlogged meals are shown as “Not logged” — not assumed skipped.
            </p>
            <ul className="mt-3 divide-y divide-line text-sm">
              {pva.meals.map((m) => (
                <li key={m.slot} className="grid gap-1 py-2 sm:grid-cols-[110px_1fr_auto] sm:items-baseline">
                  <span className="text-xs font-semibold text-muted">{m.label}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-ink">{m.plannedName}</span>
                    <span className="block truncate text-xs text-muted">{m.logged ? `Logged: ${m.logged.foods.join(", ")}` : "Not logged."}</span>
                  </span>
                  <span className="text-xs tabular-nums text-muted">
                    {m.planned.calories} kcal planned{m.logged ? ` · ${m.logged.calories} kcal logged` : ""}
                  </span>
                </li>
              ))}
            </ul>
            {pva.unplannedSlots.length > 0 && <p className="mt-2 text-xs text-muted">Also logged outside the plan: {pva.unplannedSlots.join(", ")}.</p>}
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(["calories", "protein", "carbohydrates", "fat"] as const).map((k) => {
                const unit = k === "calories" ? "kcal" : "g";
                const diff = pva.difference[k];
                return (
                  <div key={k} className="rounded-[10px] border border-line bg-canvas p-2.5">
                    <p className="text-[11px] font-medium capitalize text-muted">{k}</p>
                    <p className="text-sm font-bold tabular-nums text-ink">
                      {num(pva.actual[k])} <span className="text-xs font-medium text-muted">/ {num(pva.planned[k], unit)}</span>
                    </p>
                    <p className="text-[11px] tabular-nums text-muted">
                      {diff > 0 ? "+" : ""}
                      {diff} {unit} vs plan
                    </p>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function WaterCard({ data }: { data: DailyAnalytics }) {
  return (
    <Card>
      <CardBody>
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
          <Droplets className="h-4 w-4 text-brand-500" aria-hidden="true" /> Water
        </h2>
        <p className="mt-1 text-lg font-bold tabular-nums text-ink">
          {formatLitres(data.water.totalMl)} <span className="text-sm font-medium text-muted">/ {formatLitres(data.water.targetMl)}</span>
        </p>
        <ProgressBar value={data.water.totalMl} target={data.water.targetMl} label="Water" unit="ml" size="sm" className="mt-2" barClass="bg-brand-400" />
        <p className="mt-1 text-[11px] text-muted">{data.water.entries} entr{data.water.entries === 1 ? "y" : "ies"} · target is your configured amount, not a medical requirement.</p>
      </CardBody>
    </Card>
  );
}

function InsightList({ insights, showAll, onToggle }: { insights: Insight[]; showAll: boolean; onToggle: () => void }) {
  const shown = showAll ? insights : insights.slice(0, 4);
  if (insights.length === 0) return <p className="mt-2 text-sm text-muted">No insights yet.</p>;
  return (
    <>
      <ul className="mt-3 space-y-2">
        {shown.map((i) => (
          <li key={i.id} className={cn("entry-enter rounded-[10px] border p-3", i.tone === "attention" ? "border-accent-300/40 bg-accent-200/20" : i.tone === "positive" ? "border-brand-100 bg-brand-50/60" : "border-line bg-canvas")}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-ink">{i.title}</p>
              <SourceTag>{i.source}</SourceTag>
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">{i.detail}</p>
          </li>
        ))}
      </ul>
      {insights.length > 4 && (
        <button type="button" onClick={onToggle} className="mt-2 text-xs font-semibold text-brand-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300">
          {showAll ? "Show fewer" : `Show ${insights.length - 4} more`}
        </button>
      )}
    </>
  );
}

function ComparisonTable({ rows, currentLabel, previousLabel }: { rows: DailyAnalytics["comparison"]["rows"] & object; currentLabel: string; previousLabel: string }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted">
            <th scope="col" className="py-1.5 pr-2">
              Metric
            </th>
            <th scope="col" className="py-1.5 pr-2 text-right">
              {currentLabel}
            </th>
            <th scope="col" className="py-1.5 pr-2 text-right">
              {previousLabel}
            </th>
            <th scope="col" className="py-1.5 text-right">
              Change
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row" className="py-2 pr-2 text-left font-medium text-ink">
                {r.label}
              </th>
              <td className="py-2 pr-2 text-right tabular-nums text-ink">{num(r.current, r.unit)}</td>
              <td className="py-2 pr-2 text-right tabular-nums text-muted">{num(r.previous, r.unit)}</td>
              <td className="py-2 text-right tabular-nums text-muted">
                {r.change === null ? "—" : (
                  <>
                    <span aria-hidden="true">{r.change > 0 ? "▲" : r.change < 0 ? "▼" : "•"}</span> {r.change > 0 ? "+" : ""}
                    {num(r.change, r.unit)}
                    {r.changePercent !== null && <span className="text-xs"> ({r.changePercent > 0 ? "+" : ""}{r.changePercent}%)</span>}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ================================ WEEKLY =============================== */

function WeeklyView({ data, loading }: { data: WeeklyAnalytics; loading: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const labels = useMemo(() => data.points.map((p) => formatDay(p.date, { weekday: "short" })), [data.points]);
  const daysWithFood = data.averages.daysWithFood;
  const enough = daysWithFood >= 2;

  if (daysWithFood === 0 && data.averages.daysWithWater === 0 && data.weightPoints.every((w) => w.weightKg === null)) {
    return (
      <EmptyState
        icon={<BarChart3 className="h-6 w-6" aria-hidden="true" />}
        title="More data is needed to show a weekly trend."
        description={`Nothing was logged between ${formatDay(data.range.start)} and ${formatDay(data.range.end)}. Log meals, water or weight and this view fills in — one day at a time, no invented points.`}
        action={
          <Button href="/dashboard" icon={<UtensilsCrossed className="h-4 w-4" />}>
            Go to the dashboard
          </Button>
        }
      />
    );
  }

  const chart = (key: "calories" | "protein" | "waterMl") => data.points.map((p, i) => ({ label: labels[i], value: p[key] }));

  return (
    <div className={cn("grid gap-5 lg:grid-cols-[1fr_320px]", loading && "opacity-70 transition-opacity")}>
      <div className="space-y-5">
        <Card>
          <CardBody>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-ink">Weekly averages</h2>
              <SourceTag>Logged</SourceTag>
            </div>
            <p className="mt-0.5 text-xs text-muted">
              Averaged over the {daysWithFood} day{daysWithFood === 1 ? "" : "s"} with food entries (water over {data.averages.daysWithWater}); empty days are not counted as zero.
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Avg calories" value={num(data.averages.calories, "kcal")} sub={data.targets.calories ? `target ${data.targets.calories}` : undefined} />
              <Metric label="Avg protein" value={num(data.averages.protein, "g")} sub={data.targets.protein ? `target ${data.targets.protein} g` : undefined} />
              <Metric label="Avg carbs" value={num(data.averages.carbohydrates, "g")} sub={data.targets.carbohydrates ? `target ${data.targets.carbohydrates} g` : undefined} />
              <Metric label="Avg fat" value={num(data.averages.fat, "g")} sub={data.targets.fat ? `target ${data.targets.fat} g` : undefined} />
              <Metric label="Avg fibre" value="Not available" sub="no fibre data" />
              <Metric label="Avg water" value={data.averages.waterMl === null ? "—" : formatLitres(data.averages.waterMl)} sub={`target ${formatLitres(data.waterTargetMl)}`} />
              <Metric label="Meals logged" value={String(data.averages.mealsLogged)} sub={`${data.averages.entries} entries`} />
              <Metric label="Days logged" value={`${daysWithFood} / 7`} />
            </dl>
          </CardBody>
        </Card>

        {enough ? (
          <>
            <ChartCard title="Calories per day" unit="kcal">
              <BarChart title="Calories per day" points={chart("calories")} unit="kcal" target={data.targets.calories} barClass="fill-brand-600" />
            </ChartCard>
            <ChartCard title="Protein per day" unit="g">
              <BarChart title="Protein per day" points={chart("protein")} unit="g" target={data.targets.protein} barClass="fill-brand-400" />
            </ChartCard>
          </>
        ) : (
          <Card>
            <CardBody>
              <p className="text-sm text-muted">More data is needed to show a weekly trend — food has been logged on {daysWithFood} day so far this week.</p>
            </CardBody>
          </Card>
        )}
        {data.averages.daysWithWater >= 2 && (
          <ChartCard title="Water per day" unit="ml">
            <BarChart title="Water per day" points={chart("waterMl")} unit="ml" target={data.waterTargetMl} barClass="fill-brand-300" />
          </ChartCard>
        )}
        {data.weightPoints.some((w) => w.weightKg !== null) && (
          <ChartCard title="Weight this week" unit="kg" note={data.weightPoints.filter((w) => w.weightKg !== null).length < 2 ? "One record this week — shown as a point, not a trend." : undefined}>
            <LineChart title="Weight this week" points={data.weightPoints.map((w, i) => ({ label: labels[i], value: w.weightKg }))} unit="kg" />
          </ChartCard>
        )}

        <Card>
          <CardBody>
            <h2 className="text-sm font-bold text-ink">{data.comparison.label}</h2>
            <p className="mt-0.5 text-xs text-muted">
              Previous week: {formatDay(data.previousRange.start)} – {formatDay(data.previousRange.end)}. Averages over logged days; “Meals logged” is a weekly total.
            </p>
            {data.comparison.rows ? <ComparisonTable rows={data.comparison.rows} currentLabel="This week" previousLabel="Last week" /> : <p className="mt-3 text-sm text-muted">Nothing logged in either week to compare.</p>}
          </CardBody>
        </Card>
      </div>

      <aside className="space-y-5">
        <Card>
          <CardBody>
            <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
              <Sparkles className="h-4 w-4 text-brand-500" aria-hidden="true" /> Weekly insights
            </h2>
            <InsightList insights={data.insights} showAll={showAll} onToggle={() => setShowAll((s) => !s)} />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
              <Info className="h-4 w-4 text-brand-500" aria-hidden="true" /> How to read this
            </h2>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-muted">
              <li>Bars are missing on days with nothing logged — no values are invented.</li>
              <li>The dashed line is your configured target.</li>
              <li>Estimates come from the snapshot saved with each log entry.</li>
            </ul>
          </CardBody>
        </Card>
      </aside>
    </div>
  );
}

function ChartCard({ title, unit, note, children }: { title: string; unit: string; note?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardBody>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-ink">{title}</h2>
          <span className="text-xs text-muted">{unit}</span>
        </div>
        <div className="mt-3">{children}</div>
        {note && <p className="mt-2 text-xs text-muted">{note}</p>}
      </CardBody>
    </Card>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card-hover rounded-[10px] border border-line bg-canvas p-3">
      <dt className="text-[11px] font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 text-base font-bold tabular-nums text-ink">{value}</dd>
      {sub && <dd className="text-[11px] text-muted">{sub}</dd>}
    </div>
  );
}
