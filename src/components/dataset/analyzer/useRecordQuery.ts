"use client";

/**
 * Phase 7 — shared filter/sort/page state for the Student Dataset Analyzer.
 * Kept as plain React state + a query-string serialiser (no new state library).
 */
import { useCallback, useMemo, useState } from "react";

export interface RecordFilters {
  search: string;
  ageMin: string;
  ageMax: string;
  bmiMin: string;
  bmiMax: string;
  gender: string;
  recordStatus: string;
  qualityStatus: string;
  nutritionStatus: string;
  incomplete: boolean;
  includeExcluded: boolean;
  reviewed: "" | "1" | "0";
}

export const EMPTY_FILTERS: RecordFilters = {
  search: "",
  ageMin: "",
  ageMax: "",
  bmiMin: "",
  bmiMax: "",
  gender: "",
  recordStatus: "",
  qualityStatus: "",
  nutritionStatus: "",
  incomplete: false,
  includeExcluded: false,
  reviewed: "",
};

export interface RecordSort {
  sort: string;
  direction: "asc" | "desc";
}

/** Only the filter part (no paging/sorting) — used for stats/export/analysis. */
export function filtersToParams(f: RecordFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.search.trim()) p.set("search", f.search.trim());
  for (const k of ["ageMin", "ageMax", "bmiMin", "bmiMax", "gender", "recordStatus", "qualityStatus", "nutritionStatus"] as const) {
    if (f[k] !== "") p.set(k, f[k]);
  }
  if (f.incomplete) p.set("incomplete", "1");
  if (f.includeExcluded) p.set("includeExcluded", "1");
  if (f.reviewed) p.set("reviewed", f.reviewed);
  return p;
}

export function countActiveFilters(f: RecordFilters): number {
  return filtersToParams(f).size - (f.search.trim() ? 1 : 0);
}

export function useRecordQuery() {
  const [filters, setFilters] = useState<RecordFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<RecordSort>({ sort: "rowIndex", direction: "asc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const update = useCallback((patch: Partial<RecordFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  }, []);

  const reset = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }, []);

  const toggleSort = useCallback((field: string) => {
    setSort((prev) => (prev.sort === field ? { sort: field, direction: prev.direction === "asc" ? "desc" : "asc" } : { sort: field, direction: "asc" }));
    setPage(1);
  }, []);

  const filterQuery = useMemo(() => filtersToParams(filters).toString(), [filters]);
  const listQuery = useMemo(() => {
    const p = filtersToParams(filters);
    p.set("sort", sort.sort);
    p.set("direction", sort.direction);
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    return p.toString();
  }, [filters, sort, page, pageSize]);

  return { filters, update, reset, sort, toggleSort, page, setPage, pageSize, setPageSize, filterQuery, listQuery };
}
