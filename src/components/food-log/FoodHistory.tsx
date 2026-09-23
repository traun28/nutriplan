"use client";

/**
 * Phase 2 — paginated food history (newest first) with edit / repeat /
 * delete. Loads one page at a time; re-fetches when the shared log
 * revision changes (e.g. an edit made from the dialog).
 */
import { ChevronLeft, ChevronRight, Copy, History, PencilLine, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useDayLog } from "@/context/DayLogContext";
import { useAsyncData } from "@/hooks/useAsyncData";
import { apiClient } from "@/services/apiClient";
import { Button, Card, CardBody, EmptyState } from "@/components/ui/core";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Toast, useToast } from "@/components/ui/Toast";
import { FoodLogDialog } from "@/components/food-log/FoodLogDialog";
import { IconButton } from "@/components/dashboard/TodaysMeals";
import { formatTime } from "@/data/options";
import { toDateKey } from "@/services/foodLog/calculations";
import { foodLogMealLabel, type FoodHistoryPage, type FoodLogEntry } from "@/services/foodLog/types";
import { cn } from "@/lib/cn";

const PAGE_SIZE = 20;

function formatDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function FoodHistoryView() {
  const { deleteEntry, revision } = useDayLog();
  const { toast, show, dismiss } = useToast();
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<{ open: boolean; entry: FoodLogEntry | null; repeat?: FoodLogEntry }>({ open: false, entry: null });
  const [pendingDelete, setPendingDelete] = useState<FoodLogEntry | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loader = useCallback(
    () => apiClient.get<FoodHistoryPage>(`/api/food-logs?page=${page}&pageSize=${PAGE_SIZE}`),
    [page],
  );
  const { state, reload, reloading } = useAsyncData(loader, [page, revision]);

  const totalPages = state.status === "ready" ? Math.max(1, Math.ceil(state.data.total / PAGE_SIZE)) : 1;

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    setDeletingId(target.id);
    const result = await deleteEntry(target.id);
    setDeletingId(null);
    // A successful delete bumps the shared revision, which refetches the page.
    show(result.ok ? `Removed ${target.foodName}.` : result.message, result.ok ? "success" : "error");
  };

  // Group the page's entries by date for readability.
  const groups: { date: string; entries: FoodLogEntry[] }[] = [];
  if (state.status === "ready") {
    for (const entry of state.data.entries) {
      const last = groups[groups.length - 1];
      if (last && last.date === entry.logDate) last.entries.push(entry);
      else groups.push({ date: entry.logDate, entries: [entry] });
    }
  }

  return (
    <div className="page-container page-section">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-400">Food history</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">Everything you have logged</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
            Newest first. Edit, repeat or remove any entry — your daily totals update automatically.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void reload()} loading={reloading} icon={<RefreshCw className="h-4 w-4" />}>
            Refresh
          </Button>
          <Button onClick={() => setDialog({ open: true, entry: null })} icon={<Plus className="h-4 w-4" />}>
            Log food
          </Button>
        </div>
      </header>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-brand-50/60 px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
            <History className="h-4 w-4 text-brand-400" aria-hidden="true" />
            Logged entries
          </h2>
          {state.status === "ready" && state.data.total > 0 && (
            <p className="text-xs text-muted">
              {state.data.total.toLocaleString()} {state.data.total === 1 ? "entry" : "entries"} · page {page} of {totalPages}
            </p>
          )}
        </div>

        {state.status === "loading" && (
          <CardBody className="space-y-3" aria-busy="true" aria-label="Loading history">
            {[0, 1, 2, 3, 4].map((index) => (
              <div key={index} className="flex items-center justify-between gap-4 rounded-[10px] border border-line bg-canvas p-3.5">
                <div className="flex-1">
                  <div className="skeleton h-4 w-2/5" />
                  <div className="skeleton mt-2 h-3 w-1/4" />
                </div>
                <div className="skeleton h-4 w-16" />
              </div>
            ))}
          </CardBody>
        )}

        {state.status === "error" && (
          <CardBody>
            <EmptyState
              title="Could not load your history"
              description={state.error.message}
              action={
                <Button variant="outline" onClick={() => void reload()} icon={<RefreshCw className="h-4 w-4" />}>
                  Try again
                </Button>
              }
            />
          </CardBody>
        )}

        {state.status === "ready" && state.data.entries.length === 0 && (
          <CardBody>
            <EmptyState
              icon={<History className="h-6 w-6" aria-hidden="true" />}
              title="No food history yet"
              description="Meals you log will appear here so you can review, edit or repeat them."
              action={
                <Button onClick={() => setDialog({ open: true, entry: null })} icon={<Plus className="h-4 w-4" />}>
                  Log your first meal
                </Button>
              }
            />
          </CardBody>
        )}

        {state.status === "ready" && state.data.entries.length > 0 && (
          <>
            {/* Desktop table */}
            <div className="hidden table-scroll md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line bg-canvas text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-semibold">Date</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Meal</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Food</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Quantity</th>
                    <th scope="col" className="px-3 py-3 text-right font-semibold">Calories</th>
                    <th scope="col" className="px-3 py-3 text-right font-semibold">Protein</th>
                    <th scope="col" className="px-5 py-3 text-right font-semibold">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {state.data.entries.map((entry) => (
                    <tr key={entry.id} className={cn("transition-colors hover:bg-brand-50/40", deletingId === entry.id && "opacity-50")}>
                      <td className="whitespace-nowrap px-5 py-3 text-ink">
                        {formatDate(entry.logDate)}
                        {entry.loggedTime && <span className="block text-xs text-muted">{formatTime(entry.loggedTime)}</span>}
                      </td>
                      <td className="px-3 py-3 text-muted">{foodLogMealLabel(entry.mealType)}</td>
                      <td className="px-3 py-3 font-semibold text-ink">{entry.foodName}</td>
                      <td className="px-3 py-3 text-muted">{entry.portionLabel}</td>
                      <td className="px-3 py-3 text-right font-semibold text-ink">{entry.calories} kcal</td>
                      <td className="px-3 py-3 text-right text-muted">{entry.proteinGrams} g</td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1">
                          <IconButton label={`Repeat ${entry.foodName} today`} onClick={() => setDialog({ open: true, entry: null, repeat: entry })}>
                            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                          </IconButton>
                          <IconButton label={`Edit ${entry.foodName}`} onClick={() => setDialog({ open: true, entry })}>
                            <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
                          </IconButton>
                          <IconButton label={`Delete ${entry.foodName}`} onClick={() => setPendingDelete(entry)} danger disabled={deletingId === entry.id}>
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="divide-y divide-line md:hidden">
              {groups.map((group) => (
                <li key={group.date} className="px-5 py-4">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-brand-300">{formatDate(group.date)}</h3>
                  <ul className="mt-2.5 space-y-2">
                    {group.entries.map((entry) => (
                      <li key={entry.id} className={cn("rounded-[10px] border border-line bg-canvas p-3", deletingId === entry.id && "opacity-50")}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-ink">{entry.foodName}</p>
                            <p className="mt-0.5 text-xs text-muted">
                              {foodLogMealLabel(entry.mealType)} · {entry.portionLabel}
                              {entry.loggedTime ? ` · ${formatTime(entry.loggedTime)}` : ""}
                            </p>
                          </div>
                          <p className="shrink-0 text-right text-xs text-muted">
                            <strong className="block text-sm text-ink">{entry.calories} kcal</strong>P {entry.proteinGrams} g
                          </p>
                        </div>
                        <div className="mt-2.5 flex justify-end gap-1">
                          <IconButton label={`Repeat ${entry.foodName} today`} onClick={() => setDialog({ open: true, entry: null, repeat: entry })}>
                            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                          </IconButton>
                          <IconButton label={`Edit ${entry.foodName}`} onClick={() => setDialog({ open: true, entry })}>
                            <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
                          </IconButton>
                          <IconButton label={`Delete ${entry.foodName}`} onClick={() => setPendingDelete(entry)} danger disabled={deletingId === entry.id}>
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </IconButton>
                        </div>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>

            {totalPages > 1 && (
              <nav aria-label="History pages" className="flex items-center justify-between gap-3 border-t border-line px-5 py-3.5">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} icon={<ChevronLeft className="h-3.5 w-3.5" />}>
                  Newer
                </Button>
                <span className="text-xs text-muted">
                  Page {page} of {totalPages}
                </span>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>
                  Older
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </nav>
            )}
          </>
        )}
      </Card>

      <FoodLogDialog
        open={dialog.open}
        onClose={() => setDialog((current) => ({ ...current, open: false }))}
        entry={dialog.entry}
        defaultDate={dialog.repeat ? toDateKey() : undefined}
        defaultMealType={dialog.repeat?.mealType}
        defaultFoodId={dialog.repeat?.foodId}
        defaultServings={dialog.repeat?.servings}
        onSaved={(entry, mode) => {
          show(mode === "edit" ? `Updated ${entry.foodName}.` : `Logged ${entry.foodName} on ${formatDate(entry.logDate)}.`);
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this food entry?"
        description={pendingDelete ? `${pendingDelete.foodName} on ${formatDate(pendingDelete.logDate)} will be removed. This cannot be undone.` : ""}
        confirmLabel="Delete entry"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />

      <Toast toast={toast} onDismiss={dismiss} />
    </div>
  );
}

export function FoodHistory() {
  return (
    <RequireAuth>
      <FoodHistoryView />
    </RequireAuth>
  );
}
