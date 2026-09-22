"use client";

/** Phase 3 — the signed-in user's saved weekly plans (open / rename / duplicate / delete). */
import { CalendarDays, Check, Copy, FolderOpen, Loader2, Pencil, Star, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useMealPlan, type ActionResult } from "@/context/MealPlanContext";
import { Badge, Card } from "@/components/ui/core";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { WeeklyPlanListItem } from "@/services/diet/weeklyPlanner";
import { cn } from "@/lib/cn";

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function formatKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function SavedPlans({ onNotice }: { onNotice: (result: ActionResult) => void }) {
  const { savedPlans, plan, busy, openPlan, renamePlan, duplicatePlan, deletePlan, makeCurrent, setStartDate } = useMealPlan();
  const [renaming, setRenaming] = useState<{ id: number; value: string } | null>(null);
  const [dating, setDating] = useState<{ id: number; value: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<WeeklyPlanListItem | null>(null);

  if (savedPlans.length === 0) {
    return (
      <Card>
        <div className="border-b border-line bg-brand-50/60 px-5 py-3.5">
          <h2 className="text-sm font-bold text-ink">Saved plans</h2>
        </div>
        <p className="p-5 text-sm text-muted">No saved plans yet. Generated plans are saved here automatically.</p>
      </Card>
    );
  }

  const submitRename = async () => {
    if (!renaming) return;
    const name = renaming.value.trim();
    if (!name) {
      onNotice({ success: false, message: "Plan name cannot be empty." });
      return;
    }
    const result = await renamePlan(renaming.id, name);
    onNotice(result);
    if (result.success) setRenaming(null);
  };

  const submitDate = async () => {
    if (!dating) return;
    const result = await setStartDate(dating.id, dating.value || null);
    onNotice(result);
    if (result.success) setDating(null);
  };

  return (
    <Card>
      <div className="flex items-center justify-between gap-2 border-b border-line bg-brand-50/60 px-5 py-3.5">
        <h2 className="text-sm font-bold text-ink">Saved plans</h2>
        <span className="text-xs text-muted">{savedPlans.length}</span>
      </div>
      <ul className="divide-y divide-line">
        {savedPlans.map((item) => {
          const isOpen = plan?.id === item.id;
          const rowBusy = busy !== null && busy.endsWith(`:${item.id}`);
          return (
            <li key={item.id} className={cn("p-4", isOpen && "bg-brand-50/40")}>
              {renaming?.id === item.id ? (
                <form
                  className="flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submitRename();
                  }}
                >
                  <label className="sr-only" htmlFor={`rename-${item.id}`}>Plan name</label>
                  <input
                    id={`rename-${item.id}`}
                    autoFocus
                    maxLength={80}
                    value={renaming.value}
                    onChange={(e) => setRenaming({ id: item.id, value: e.target.value })}
                    className="min-w-0 flex-1 rounded-[8px] border border-line bg-surface px-2.5 py-1.5 text-sm text-ink focus:border-brand-500 focus:outline-none"
                  />
                  <IconButton label="Save name" onClick={() => void submitRename()} disabled={busy !== null}><Check className="h-3.5 w-3.5" /></IconButton>
                  <IconButton label="Cancel rename" onClick={() => setRenaming(null)}><X className="h-3.5 w-3.5" /></IconButton>
                </form>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-ink">
                      <span className="truncate">{item.name}</span>
                      {item.isCurrent && <Badge tone="brand">Current</Badge>}
                      {isOpen && !item.isCurrent && <Badge>Open</Badge>}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      Created {formatDate(item.createdAt)}
                      {item.startDate && ` · Starts ${formatKey(item.startDate)}`}
                      {` · avg ${item.summary.averageCalories.toLocaleString()} kcal/day · ${item.summary.mealCount} meals`}
                    </p>
                  </div>
                  {rowBusy && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-400" aria-hidden="true" />}
                </div>
              )}

              {dating?.id === item.id && (
                <form
                  className="mt-2 flex flex-wrap items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submitDate();
                  }}
                >
                  <label className="text-xs font-semibold text-muted" htmlFor={`date-${item.id}`}>Day 1 date</label>
                  <input
                    id={`date-${item.id}`}
                    type="date"
                    value={dating.value}
                    onChange={(e) => setDating({ id: item.id, value: e.target.value })}
                    className="rounded-[8px] border border-line bg-surface px-2.5 py-1 text-xs text-ink focus:border-brand-500 focus:outline-none"
                  />
                  <IconButton label="Save date" onClick={() => void submitDate()} disabled={busy !== null}><Check className="h-3.5 w-3.5" /></IconButton>
                  {item.startDate && (
                    <button type="button" className="text-xs font-semibold text-muted hover:text-danger-700" onClick={() => setDating({ id: item.id, value: "" }) }>
                      Clear
                    </button>
                  )}
                  <IconButton label="Cancel date" onClick={() => setDating(null)}><X className="h-3.5 w-3.5" /></IconButton>
                </form>
              )}

              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {!isOpen && (
                  <SmallButton onClick={() => void openPlan(item.id).then(onNotice)} disabled={busy !== null} icon={<FolderOpen className="h-3.5 w-3.5" />}>
                    Open
                  </SmallButton>
                )}
                {!item.isCurrent && (
                  <SmallButton onClick={() => void makeCurrent(item.id).then(onNotice)} disabled={busy !== null} icon={<Star className="h-3.5 w-3.5" />}>
                    Use on dashboard
                  </SmallButton>
                )}
                <SmallButton onClick={() => setRenaming({ id: item.id, value: item.name })} disabled={busy !== null} icon={<Pencil className="h-3.5 w-3.5" />}>
                  Rename
                </SmallButton>
                <SmallButton onClick={() => setDating({ id: item.id, value: item.startDate ?? "" })} disabled={busy !== null} icon={<CalendarDays className="h-3.5 w-3.5" />}>
                  Dates
                </SmallButton>
                <SmallButton onClick={() => void duplicatePlan(item.id).then(onNotice)} disabled={busy !== null} icon={<Copy className="h-3.5 w-3.5" />}>
                  Duplicate
                </SmallButton>
                <SmallButton onClick={() => setConfirmDelete(item)} disabled={busy !== null} icon={<Trash2 className="h-3.5 w-3.5" />} danger>
                  Delete
                </SmallButton>
              </div>
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete this plan?"
        description={`"${confirmDelete?.name ?? ""}" will be removed permanently. Other saved plans are not affected.`}
        confirmLabel="Delete plan"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          const target = confirmDelete;
          setConfirmDelete(null);
          if (target) void deletePlan(target.id).then(onNotice);
        }}
      />
    </Card>
  );
}

function SmallButton({ children, onClick, disabled, icon, danger }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; icon?: React.ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1 rounded-pill border px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-60",
        danger ? "border-line bg-surface text-muted hover:border-danger-500/40 hover:text-danger-700" : "border-line bg-surface text-ink hover:border-brand-400/50 hover:text-brand-400",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function IconButton({ children, label, onClick, disabled }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} disabled={disabled} className="grid h-8 w-8 place-items-center rounded-[8px] border border-line bg-surface text-ink hover:border-brand-400/50 hover:text-brand-400 disabled:opacity-60">
      {children}
    </button>
  );
}
