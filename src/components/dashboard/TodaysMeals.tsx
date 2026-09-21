"use client";

/**
 * Phase 2 — meals logged for the selected date, grouped by meal slot.
 * Each entry can be edited, repeated or deleted; deletion asks first.
 */
import { Clock, Copy, PencilLine, Plus, Trash2, UtensilsCrossed } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Card, EmptyState } from "@/components/ui/core";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { formatTime } from "@/data/options";
import { useDayLog } from "@/context/DayLogContext";
import { sumEntries } from "@/services/foodLog/calculations";
import { FOOD_LOG_MEAL_TYPES, type FoodLogEntry, type FoodLogMealType } from "@/services/foodLog/types";
import { cn } from "@/lib/cn";

interface Props {
  entries: FoodLogEntry[];
  loading: boolean;
  isToday: boolean;
  onLog: (mealType?: FoodLogMealType) => void;
  onEdit: (entry: FoodLogEntry) => void;
  onRepeat: (entry: FoodLogEntry) => void;
  onNotice: (message: string, tone?: "success" | "error") => void;
}

export function TodaysMeals({ entries, loading, isToday, onLog, onEdit, onRepeat, onNotice }: Props) {
  const { deleteEntry } = useDayLog();
  const [pendingDelete, setPendingDelete] = useState<FoodLogEntry | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const groups = useMemo(
    () =>
      FOOD_LOG_MEAL_TYPES.map((meal) => {
        const items = entries.filter((entry) => entry.mealType === meal.id);
        return { ...meal, items, totals: sumEntries(items) };
      }),
    [entries],
  );

  const confirmDelete = async () => {
    if (!pendingDelete || deletingId) return;
    const target = pendingDelete;
    setDeletingId(target.id);
    setPendingDelete(null);
    const result = await deleteEntry(target.id);
    setDeletingId(null);
    onNotice(result.ok ? `Removed ${target.foodName}.` : result.message, result.ok ? "success" : "error");
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-brand-50/60 px-5 py-3.5">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
            <UtensilsCrossed className="h-4 w-4 text-brand-400" aria-hidden="true" />
            {isToday ? "Today's meals" : "Meals on this day"}
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            {entries.length === 0 ? "Nothing logged yet." : `${entries.length} ${entries.length === 1 ? "entry" : "entries"} logged.`}
          </p>
        </div>
        <Button size="sm" onClick={() => onLog()} icon={<Plus className="h-3.5 w-3.5" />}>
          Log food
        </Button>
      </div>

      <div>
        {loading ? (
          <div className="space-y-4 p-5 sm:p-7" aria-busy="true" aria-label="Loading meals">
            {[0, 1, 2].map((index) => (
              <div key={index} className="rounded-[10px] border border-line bg-canvas p-4">
                <div className="skeleton h-3 w-24" />
                <div className="skeleton mt-3 h-4 w-3/5" />
                <div className="skeleton mt-2 h-3 w-2/5" />
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="p-5 sm:p-7">
            <EmptyState
              icon={<UtensilsCrossed className="h-6 w-6" aria-hidden="true" />}
              title={isToday ? "No meals logged today" : "No meals logged on this date"}
              description="Log what you eat to see how your day compares with your targets."
              action={
                <Button onClick={() => onLog()} icon={<Plus className="h-4 w-4" />}>
                  Log your first meal
                </Button>
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {groups.map((group) => (
              <li key={group.id} className="px-5 py-4 sm:px-7">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-brand-300">{group.label}</h3>
                  <div className="flex items-center gap-3">
                    {group.items.length > 0 && (
                      <span className="text-xs text-muted">
                        <strong className="text-ink">{group.totals.calories}</strong> kcal · P {group.totals.protein} g
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => onLog(group.id)}
                      aria-label={`Add food to ${group.label}`}
                      className="grid h-7 w-7 place-items-center rounded-[8px] border border-line text-muted transition-colors hover:border-brand-400/50 hover:text-brand-400"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {group.items.length === 0 ? (
                  <p className="mt-2 text-xs text-muted/80">Not logged.</p>
                ) : (
                  <ul className="mt-2.5 space-y-2">
                    {group.items.map((entry) => (
                      <li
                        key={entry.id}
                        className={cn(
                          "entry-enter card-hover flex flex-col gap-2 rounded-[10px] border border-line bg-canvas p-3 sm:flex-row sm:items-center sm:justify-between",
                          deletingId === entry.id && "opacity-50",
                        )}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink">{entry.foodName}</p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                            <span>{entry.portionLabel}</span>
                            {entry.loggedTime && (
                              <span className="inline-flex items-center gap-1">
                                <Clock className="h-3 w-3" aria-hidden="true" />
                                {formatTime(entry.loggedTime)}
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center justify-between gap-3 sm:justify-end">
                          <dl className="flex gap-3 text-xs text-muted">
                            <div>
                              <dt className="sr-only">Calories</dt>
                              <dd>
                                <strong className="text-ink">{entry.calories}</strong> kcal
                              </dd>
                            </div>
                            <div>
                              <dt className="sr-only">Protein</dt>
                              <dd>P {entry.proteinGrams} g</dd>
                            </div>
                            <div className="hidden sm:block">
                              <dt className="sr-only">Carbohydrates</dt>
                              <dd>C {entry.carbohydrateGrams} g</dd>
                            </div>
                            <div className="hidden sm:block">
                              <dt className="sr-only">Fat</dt>
                              <dd>F {entry.fatGrams} g</dd>
                            </div>
                          </dl>
                          <div className="flex shrink-0 items-center gap-1">
                            <IconButton label={`Repeat ${entry.foodName}`} onClick={() => onRepeat(entry)}>
                              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                            </IconButton>
                            <IconButton label={`Edit ${entry.foodName}`} onClick={() => onEdit(entry)}>
                              <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
                            </IconButton>
                            <IconButton
                              label={`Delete ${entry.foodName}`}
                              onClick={() => setPendingDelete(entry)}
                              danger
                              disabled={deletingId === entry.id}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </IconButton>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this food entry?"
        description={
          pendingDelete
            ? `${pendingDelete.foodName} (${pendingDelete.portionLabel}, ${pendingDelete.calories} kcal) will be removed from this day. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete entry"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </Card>
  );
}

export function IconButton({
  label,
  onClick,
  children,
  danger,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={cn(
        "grid h-8 w-8 place-items-center rounded-[8px] border border-line bg-surface text-muted transition-colors disabled:opacity-50",
        danger ? "hover:border-danger-500/40 hover:bg-danger-50 hover:text-danger-600" : "hover:border-brand-400/50 hover:bg-brand-50 hover:text-brand-400",
      )}
    >
      {children}
    </button>
  );
}
