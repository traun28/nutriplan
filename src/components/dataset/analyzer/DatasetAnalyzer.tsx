"use client";

/**
 * Phase 7 — Student Dataset Analyzer workspace for one dataset.
 *
 * Tabs: Students (table) · Dashboard (filter-aware statistics + charts) ·
 * Gap analysis (existing nutrition gap analysis, now filter-aware). One set
 * of filters drives all three, so the dashboard always describes exactly the
 * records shown in the table. Exports respect the same filters.
 */
import { Download, FileText, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Button, Card, CardBody } from "@/components/ui/core";
import { cn } from "@/lib/cn";
import { NutritionGapAnalysis } from "@/components/dataset/NutritionGapAnalysis";
import { DatasetDashboard, type StatsResponse } from "./DatasetDashboard";
import { StudentTable } from "./StudentTable";
import { StudentDetail } from "./StudentDetail";
import { useRecordQuery } from "./useRecordQuery";

interface Props {
  dataset: { id: number; displayName: string; fileName: string; recordCount: number; createdAt: string; columns: string[] };
  onClose: () => void;
  onChanged?: () => void;
}

type Tab = "students" | "dashboard" | "gaps";
/** Same look as Button size="sm" variant="outline", but a real download link (not a Next.js route link). */
const LINK_BUTTON = "inline-flex select-none items-center justify-center gap-2 rounded-pill border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink transition-all duration-200 hover:border-brand-400/50 hover:bg-brand-50 hover:text-brand-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";
const TABS: Array<[Tab, string]> = [["students", "Students"], ["dashboard", "Dashboard"], ["gaps", "Gap analysis"]];

export function DatasetAnalyzer({ dataset, onClose, onChanged }: Props) {
  const query = useRecordQuery();
  const [tab, setTab] = useState<Tab>("students");
  const [openRecord, setOpenRecord] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [genders, setGenders] = useState<string[]>([]);
  const [hasNutrition, setHasNutrition] = useState(true);

  const onStats = useCallback((s: StatsResponse) => {
    setGenders((prev) => {
      const next = s.aggregates.gender.map((g) => g.label).filter((g) => g !== "Not recorded");
      // Keep the widest set seen so filters don't disappear while filtering by gender.
      const merged = Array.from(new Set([...prev, ...next]));
      return merged.length === prev.length && merged.every((g, i) => g === prev[i]) ? prev : merged;
    });
    setHasNutrition((prev) => (s.aggregates.calories.count > 0 || s.aggregates.protein.count > 0 ? true : s.scope === "all" ? false : prev));
  }, []);

  const bump = useCallback(() => {
    setRefreshKey((k) => k + 1);
    onChanged?.();
  }, [onChanged]);

  const exportHref = useMemo(() => `/api/datasets/${dataset.id}/export?format=csv${query.filterQuery ? `&${query.filterQuery}` : ""}`, [dataset.id, query.filterQuery]);
  const reportHref = useMemo(() => `/api/datasets/${dataset.id}/export?format=report${query.filterQuery ? `&${query.filterQuery}` : ""}`, [dataset.id, query.filterQuery]);
  const filtered = query.filterQuery.length > 0;

  return (
    <div id="dataset-analyzer" className="scroll-mt-24">
    <Card className="border-brand-400/30">
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-brand-400">Student Dataset Analyzer</p>
            <h2 className="mt-1 truncate text-xl font-bold text-ink">{dataset.displayName}</h2>
            <p className="mt-1 text-xs text-muted">
              {dataset.fileName} · {dataset.recordCount.toLocaleString()} record{dataset.recordCount === 1 ? "" : "s"} · uploaded {new Date(dataset.createdAt).toLocaleDateString()}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={exportHref} download className={LINK_BUTTON}>
              <Download className="h-3.5 w-3.5" aria-hidden="true" /> Export CSV{filtered ? " (filtered)" : ""}
            </a>
            <a href={reportHref} target="_blank" rel="noopener" className={LINK_BUTTON}>
              <FileText className="h-3.5 w-3.5" aria-hidden="true" /> Printable report{filtered ? " (filtered)" : ""}
            </a>
            <Button size="sm" variant="ghost" onClick={onClose} icon={<X className="h-3.5 w-3.5" aria-hidden="true" />} aria-label="Close analyzer">
              Close
            </Button>
          </div>
        </div>

        {/* Stats hidden but still loaded on the Students tab so filter options reflect the data. */}
        <div role="tablist" aria-label="Analyzer view" className="inline-flex flex-wrap rounded-pill border border-line bg-canvas p-1">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              role="tab"
              type="button"
              id={`analyzer-tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`analyzer-panel-${id}`}
              onClick={() => setTab(id)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                const i = TABS.findIndex(([t]) => t === tab);
                const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length][0];
                setTab(next);
              }}
              className={cn("rounded-pill px-4 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300", tab === id ? "bg-brand-500 text-white" : "text-muted hover:text-ink")}
            >
              {label}
            </button>
          ))}
        </div>

        <div id="analyzer-panel-students" role="tabpanel" aria-labelledby="analyzer-tab-students" hidden={tab !== "students"}>
          <StudentTable
            datasetId={dataset.id}
            listQuery={query.listQuery}
            filters={query.filters}
            update={query.update}
            reset={query.reset}
            sort={query.sort}
            toggleSort={query.toggleSort}
            page={query.page}
            setPage={query.setPage}
            pageSize={query.pageSize}
            setPageSize={query.setPageSize}
            genders={genders}
            hasNutrition={hasNutrition}
            onOpen={setOpenRecord}
            refreshKey={refreshKey}
          />
        </div>
        <div id="analyzer-panel-dashboard" role="tabpanel" aria-labelledby="analyzer-tab-dashboard" hidden={tab !== "dashboard"}>
          <DatasetDashboard datasetId={dataset.id} filterQuery={query.filterQuery} refreshKey={refreshKey} onStats={onStats} />
        </div>
        <div id="analyzer-panel-gaps" role="tabpanel" aria-labelledby="analyzer-tab-gaps" hidden={tab !== "gaps"}>
          {tab === "gaps" && <NutritionGapAnalysis datasetId={dataset.id} filterQuery={query.filterQuery} refreshKey={refreshKey} />}
        </div>

        {openRecord !== null && (
          <StudentDetail datasetId={dataset.id} recordId={openRecord} onClose={() => setOpenRecord(null)} onChanged={bump} />
        )}
      </CardBody>
    </Card>
    </div>
  );
}
