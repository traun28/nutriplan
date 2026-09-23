"use client";

/**
 * Phase 7 — student records table: server-side search, filters, sorting,
 * pagination and a column chooser. Everything shown comes from
 * /api/datasets/:id/records; the table never filters client-side.
 */
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Columns3, Loader2, Search, SlidersHorizontal, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiClient, toUserMessage } from "@/services/apiClient";
import { Badge, Button, EmptyState } from "@/components/ui/core";
import { cn } from "@/lib/cn";
import type { RecordListItem } from "@/services/dataset/recordProjection";
import type { RecordFilters, RecordSort } from "./useRecordQuery";
import { countActiveFilters } from "./useRecordQuery";

interface Props {
  datasetId: number;
  listQuery: string;
  filters: RecordFilters;
  update: (patch: Partial<RecordFilters>) => void;
  reset: () => void;
  sort: RecordSort;
  toggleSort: (field: string) => void;
  page: number;
  setPage: (page: number) => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  /** Distinct gender values present in the dataset (from stats) — filter shows only existing values. */
  genders: string[];
  /** Whether nutrition columns exist in this dataset. */
  hasNutrition: boolean;
  onOpen: (recordId: number) => void;
  refreshKey: number;
}

interface PageResponse {
  records: RecordListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

interface ColumnDef {
  key: string;
  label: string;
  sortable?: boolean;
  numeric?: boolean;
  default: boolean;
  render: (r: RecordListItem) => React.ReactNode;
}

const STATUS_TONE: Record<string, "brand" | "warning" | "danger" | "neutral"> = { complete: "brand", incomplete: "warning", needs_review: "danger" };
const NUTRITION_LABEL: Record<string, string> = { below_target: "Below target", adequate: "Adequate", above_reference: "Above reference", not_assessable: "Not assessable" };

const fmt = (v: number | null, d = 1) => (v === null || v === undefined ? "—" : Number.isInteger(v) ? String(v) : v.toFixed(d));

function buildColumns(hasNutrition: boolean): ColumnDef[] {
  const cols: ColumnDef[] = [
    { key: "participantId", label: "ID", sortable: true, default: true, render: (r) => <span className="font-semibold text-ink">{r.participantId || "—"}</span> },
    { key: "name", label: "Name", sortable: true, default: true, render: (r) => r.name || "—" },
    { key: "age", label: "Age", sortable: true, numeric: true, default: true, render: (r) => fmt(r.age, 0) },
    { key: "gender", label: "Gender", default: true, render: (r) => r.gender || "—" },
    { key: "heightCm", label: "Height (cm)", sortable: true, numeric: true, default: true, render: (r) => fmt(r.heightCm) },
    { key: "weightKg", label: "Weight (kg)", sortable: true, numeric: true, default: true, render: (r) => fmt(r.weightKg) },
    { key: "bmi", label: "BMI", sortable: true, numeric: true, default: true, render: (r) => fmt(r.bmi) },
    { key: "activityLevel", label: "Activity", default: false, render: (r) => r.activityLevel || "—" },
  ];
  if (hasNutrition) {
    cols.push(
      { key: "calories", label: "Calories", sortable: true, numeric: true, default: true, render: (r) => fmt(r.calories, 0) },
      { key: "protein", label: "Protein (g)", sortable: true, numeric: true, default: false, render: (r) => fmt(r.protein) },
      { key: "carbohydratesG", label: "Carbs (g)", numeric: true, default: false, render: (r) => fmt(r.carbohydratesG) },
      { key: "fatG", label: "Fat (g)", numeric: true, default: false, render: (r) => fmt(r.fatG) },
      { key: "nutritionStatus", label: "Nutrition", default: true, render: (r) => <span className="text-xs">{NUTRITION_LABEL[r.nutritionStatus] ?? r.nutritionStatus}</span> },
    );
  }
  cols.push(
    {
      key: "recordStatus", label: "Status", sortable: true, default: true,
      render: (r) => (
        <span className="inline-flex flex-wrap items-center gap-1">
          <Badge tone={STATUS_TONE[r.recordStatus] ?? "neutral"} className="px-2 py-0.5 text-[11px]">{r.recordStatus.replace("_", " ")}</Badge>
          {r.outlierCount > 0 && <Badge tone="warning" className="px-2 py-0.5 text-[11px]">Potential outlier</Badge>}
          {r.reviewed && <Badge tone="neutral" className="px-2 py-0.5 text-[11px]">Reviewed</Badge>}
          {r.excluded && <Badge tone="neutral" className="px-2 py-0.5 text-[11px]">Excluded</Badge>}
        </span>
      ),
    },
    { key: "issueCount", label: "Issues", numeric: true, default: false, render: (r) => String(r.issueCount) },
  );
  return cols;
}

export function StudentTable(props: Props) {
  const { datasetId, listQuery, filters, update, reset, sort, toggleSort, page, setPage, pageSize, setPageSize, genders, hasNutrition, onOpen, refreshKey } = props;
  const columns = useMemo(() => buildColumns(hasNutrition), [hasNutrition]);
  const [visible, setVisible] = useState<Set<string>>(() => new Set(columns.filter((c) => c.default).map((c) => c.key)));
  const [data, setData] = useState<PageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const seq = useRef(0);

  // Debounced search → server.
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchDraft !== filters.search) update({ search: searchDraft });
    }, 350);
    return () => clearTimeout(t);
  }, [searchDraft, filters.search, update]);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<PageResponse>(`/api/datasets/${datasetId}/records?${listQuery}`);
      if (mine === seq.current) setData(res);
    } catch (err) {
      if (mine === seq.current) setError(toUserMessage(err, "The records could not be loaded."));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [datasetId, listQuery]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load, refreshKey]);

  const activeCount = countActiveFilters(filters);
  const shown = columns.filter((c) => visible.has(c.key));

  const SortIcon = ({ field }: { field: string }) =>
    sort.sort !== field ? <ArrowUpDown className="h-3 w-3 opacity-50" aria-hidden="true" /> : sort.direction === "asc" ? <ArrowUp className="h-3 w-3" aria-hidden="true" /> : <ArrowDown className="h-3 w-3" aria-hidden="true" />;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[200px] flex-1">
          <span className="sr-only">Search by name or participant ID</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Search name or ID…"
            className="w-full rounded-[10px] border border-line bg-surface py-2 pl-9 pr-8 text-sm text-ink focus:border-brand-500 focus:outline-none"
          />
          {searchDraft && (
            <button type="button" aria-label="Clear search" onClick={() => setSearchDraft("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted hover:text-ink">
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </label>
        <Button size="sm" variant={showFilters || activeCount > 0 ? "secondary" : "outline"} icon={<SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />} onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
          Filters{activeCount > 0 ? ` (${activeCount})` : ""}
        </Button>
        <div className="relative">
          <Button size="sm" variant="outline" icon={<Columns3 className="h-3.5 w-3.5" aria-hidden="true" />} onClick={() => setShowColumns((v) => !v)} aria-expanded={showColumns} aria-haspopup="true">
            Columns
          </Button>
          {showColumns && (
            <div role="group" aria-label="Choose columns" className="absolute right-0 z-20 mt-1 w-56 rounded-[10px] border border-line bg-surface p-2 shadow-lg">
              {columns.map((c) => (
                <label key={c.key} className="flex items-center gap-2 rounded px-2 py-1 text-xs text-ink hover:bg-canvas">
                  <input
                    type="checkbox"
                    checked={visible.has(c.key)}
                    onChange={(e) => setVisible((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(c.key); else if (next.size > 1) next.delete(c.key);
                      return next;
                    })}
                  />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {showFilters && (
        <fieldset className="grid gap-3 rounded-[10px] border border-line bg-canvas p-3 sm:grid-cols-2 lg:grid-cols-4">
          <legend className="sr-only">Filters</legend>
          <RangeField label="Age" min={filters.ageMin} max={filters.ageMax} onMin={(v) => update({ ageMin: v })} onMax={(v) => update({ ageMax: v })} />
          <RangeField label="BMI" min={filters.bmiMin} max={filters.bmiMax} onMin={(v) => update({ bmiMin: v })} onMax={(v) => update({ bmiMax: v })} step="0.1" />
          {genders.length > 0 && (
            <SelectField label="Gender" value={filters.gender} onChange={(v) => update({ gender: v })} options={genders.map((g) => [g, g])} />
          )}
          <SelectField label="Record status" value={filters.recordStatus} onChange={(v) => update({ recordStatus: v })} options={[["complete", "Complete"], ["incomplete", "Incomplete"], ["needs_review", "Needs review"]]} />
          <SelectField label="Quality flag" value={filters.qualityStatus} onChange={(v) => update({ qualityStatus: v })} options={[["clean", "Clean"], ["needs_review", "Needs review"], ["missing_value", "Missing value"], ["ambiguous", "Ambiguous"], ["parse_error", "Parse error"]]} />
          {hasNutrition && (
            <SelectField label="Nutrition status" value={filters.nutritionStatus} onChange={(v) => update({ nutritionStatus: v })} options={[["below_target", "Below target"], ["adequate", "Adequate"], ["above_reference", "Above reference"], ["not_assessable", "Not assessable"]]} />
          )}
          <SelectField label="Review" value={filters.reviewed} onChange={(v) => update({ reviewed: v as RecordFilters["reviewed"] })} options={[["1", "Reviewed"], ["0", "Not reviewed"]]} />
          <div className="flex flex-col justify-end gap-1.5 text-xs">
            <label className="flex items-center gap-2"><input type="checkbox" checked={filters.incomplete} onChange={(e) => update({ incomplete: e.target.checked })} /> Incomplete or needs review only</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={filters.includeExcluded} onChange={(e) => update({ includeExcluded: e.target.checked })} /> Include excluded records</label>
          </div>
          <div className="flex items-end sm:col-span-2 lg:col-span-4">
            <Button size="sm" variant="ghost" onClick={() => { reset(); setSearchDraft(""); }} disabled={activeCount === 0 && !filters.search}>Clear all filters</Button>
          </div>
        </fieldset>
      )}

      {/* Table */}
      <div className="relative table-scroll rounded-[10px] border border-line" aria-busy={loading}>
        {loading && (
          <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 bg-surface/80 px-3 py-1 text-xs text-muted" role="status">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Loading records…
          </div>
        )}
        <table className="w-full min-w-[640px] text-left text-sm">
          <caption className="sr-only">Student records — {data ? `${data.total} matching` : "loading"}</caption>
          <thead className="bg-canvas text-[11px] uppercase tracking-wide text-muted">
            <tr>
              {shown.map((c) => (
                <th key={c.key} scope="col" className={cn("px-3 py-2 font-semibold", c.numeric && "text-right")} aria-sort={sort.sort === c.key ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}>
                  {c.sortable ? (
                    <button type="button" onClick={() => toggleSort(c.key)} className={cn("inline-flex items-center gap-1 hover:text-ink", c.numeric && "flex-row-reverse")}>
                      {c.label} <SortIcon field={c.key} />
                    </button>
                  ) : c.label}
                </th>
              ))}
              <th scope="col" className="px-3 py-2"><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody>
            {data?.records.map((r) => (
              <tr key={r.id} className={cn("border-t border-line transition-colors hover:bg-brand-50/40", r.excluded && "opacity-60")}>
                {shown.map((c) => (
                  <td key={c.key} className={cn("px-3 py-2 align-middle text-ink/90", c.numeric && "text-right tabular-nums")}>{c.render(r)}</td>
                ))}
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => onOpen(r.id)} aria-label={`Open record ${r.participantId || r.rowIndex}`}>View</Button>
                </td>
              </tr>
            ))}
            {!loading && data && data.records.length === 0 && (
              <tr>
                <td colSpan={shown.length + 1} className="p-6">
                  <EmptyState title="No records match" description={activeCount > 0 || filters.search ? "Try widening the filters or clearing the search." : "This dataset has no records."} />
                </td>
              </tr>
            )}
            {loading && !data && Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-t border-line">
                <td colSpan={shown.length + 1} className="px-3 py-3"><div className="h-4 animate-pulse rounded bg-line/50" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p role="alert" className="text-xs text-danger-700">{error}</p>}

      {/* Pagination */}
      {data && data.total > 0 && (
        <nav className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted" aria-label="Pagination">
          <p>
            Showing {(data.page - 1) * data.pageSize + 1}–{Math.min(data.page * data.pageSize, data.total)} of {data.total.toLocaleString()} record{data.total === 1 ? "" : "s"}
          </p>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1">
              Rows
              <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} aria-label="Rows per page" className="rounded border border-line bg-surface px-1.5 py-1 text-xs">
                {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <Button size="sm" variant="outline" disabled={!data.hasPrev || loading} onClick={() => setPage(page - 1)} icon={<ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />}>Prev</Button>
            <span aria-current="page">Page {data.page} of {data.totalPages}</span>
            <Button size="sm" variant="outline" disabled={!data.hasNext || loading} onClick={() => setPage(page + 1)}>Next <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /></Button>
          </div>
        </nav>
      )}
    </div>
  );
}

function RangeField({ label, min, max, onMin, onMax, step = "1" }: { label: string; min: string; max: string; onMin: (v: string) => void; onMax: (v: string) => void; step?: string }) {
  return (
    <div className="text-xs">
      <span className="font-semibold text-ink">{label} range</span>
      <div className="mt-1 flex items-center gap-1.5">
        <label className="sr-only" htmlFor={`${label}-min`}>{label} minimum</label>
        <input id={`${label}-min`} type="number" inputMode="decimal" step={step} value={min} onChange={(e) => onMin(e.target.value)} placeholder="Min" className="w-full rounded border border-line bg-surface px-2 py-1.5 text-xs" />
        <span aria-hidden="true">–</span>
        <label className="sr-only" htmlFor={`${label}-max`}>{label} maximum</label>
        <input id={`${label}-max`} type="number" inputMode="decimal" step={step} value={max} onChange={(e) => onMax(e.target.value)} placeholder="Max" className="w-full rounded border border-line bg-surface px-2 py-1.5 text-xs" />
      </div>
    </div>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Array<[string, string]> }) {
  const id = `f-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="text-xs">
      <label htmlFor={id} className="font-semibold text-ink">{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded border border-line bg-surface px-2 py-1.5 text-xs">
        <option value="">Any</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}
