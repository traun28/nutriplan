"use client";

/**
 * Phase 2 — persistent daily water tracker.
 * Amounts are stored in millilitres and shown in litres; the target is a
 * per-user setting (a common planning figure, not a medical requirement).
 */
import { Check, Droplets, Minus, PencilLine, Plus, Settings2, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useDayLog } from "@/context/DayLogContext";
import { Button, Card, FieldError } from "@/components/ui/core";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { IconButton } from "@/components/dashboard/TodaysMeals";
import { formatLitres, WATER_QUICK_ADD_ML } from "@/services/foodLog/water";
import { validateWaterAmount, validateWaterTarget } from "@/services/foodLog/validation";
import { cn } from "@/lib/cn";

interface Props {
  loading: boolean;
  onNotice: (message: string, tone?: "success" | "error") => void;
}

export function WaterTracker({ loading, onNotice }: Props) {
  const { water, waterTotalMl, waterTargetMl, addWater, updateWater, deleteWater, setWaterTarget } = useDayLog();
  const [busy, setBusy] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const [showEntries, setShowEntries] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetText, setTargetText] = useState("");
  const [targetError, setTargetError] = useState<string | null>(null);

  const remaining = Math.max(0, waterTargetMl - waterTotalMl);
  const percent = waterTargetMl > 0 ? Math.round((waterTotalMl / waterTargetMl) * 100) : 0;

  const add = async (amountMl: number, key: string) => {
    if (busy) return;
    setBusy(key);
    const result = await addWater(amountMl);
    setBusy(null);
    if (!result.ok) onNotice(result.message, "error");
  };

  const addCustom = async () => {
    const amount = Math.round(Number(custom));
    const error = validateWaterAmount(amount);
    setCustomError(error);
    if (error) return;
    await add(amount, "custom");
    setCustom("");
  };

  const saveEdit = async (id: number) => {
    const amount = Math.round(Number(editText));
    const error = validateWaterAmount(amount);
    if (error) {
      onNotice(error, "error");
      return;
    }
    setBusy(`edit-${id}`);
    const result = await updateWater(id, amount);
    setBusy(null);
    if (!result.ok) onNotice(result.message, "error");
    else setEditingId(null);
  };

  const remove = async (id: number) => {
    if (busy) return;
    setBusy(`del-${id}`);
    const result = await deleteWater(id);
    setBusy(null);
    if (!result.ok) onNotice(result.message, "error");
  };

  const saveTarget = async () => {
    const value = Math.round(Number(targetText));
    const error = validateWaterTarget(value);
    setTargetError(error);
    if (error) return;
    setBusy("target");
    const result = await setWaterTarget(value);
    setBusy(null);
    if (!result.ok) {
      setTargetError(result.message);
      return;
    }
    setEditingTarget(false);
    onNotice("Water target updated.", "success");
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-brand-50/60 px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
          <Droplets className="h-4 w-4 text-brand-400" aria-hidden="true" />
          Water
        </h2>
        <button
          type="button"
          onClick={() => {
            setTargetText(String(waterTargetMl));
            setTargetError(null);
            setEditingTarget((value) => !value);
          }}
          aria-expanded={editingTarget}
          className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-1 text-xs font-semibold text-muted transition-colors hover:border-brand-400/50 hover:text-brand-400"
        >
          <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
          Target
        </button>
      </div>
      <div className="p-5">
        {loading ? (
          <div aria-busy="true" aria-label="Loading water">
            <div className="skeleton h-8 w-32" />
            <div className="skeleton mt-3 h-2.5 w-full" />
            <div className="mt-4 flex gap-2">
              <div className="skeleton h-9 w-20" />
              <div className="skeleton h-9 w-20" />
              <div className="skeleton h-9 w-20" />
            </div>
          </div>
        ) : (
          <>
            <p className="text-2xl font-extrabold tracking-tight text-ink">
              {formatLitres(waterTotalMl)}
              <span className="text-sm font-semibold text-muted"> / {formatLitres(waterTargetMl)}</span>
            </p>
            <ProgressBar
              className="mt-3"
              label="Water"
              unit="ml"
              value={waterTotalMl}
              target={waterTargetMl}
              barClass="bg-brand-500"
            />
            <p className="mt-2 text-xs text-muted">
              {waterTotalMl >= waterTargetMl
                ? `Target reached · ${percent}%`
                : `${formatLitres(remaining)} remaining · ${percent}% of target`}
            </p>

            {editingTarget && (
              <div className="mt-4 rounded-[10px] border border-line bg-canvas p-3">
                <label htmlFor="water-target" className="text-xs font-semibold text-ink">
                  Daily water target (ml)
                </label>
                <div className="mt-1.5 flex gap-2">
                  <input
                    id="water-target"
                    type="number"
                    inputMode="numeric"
                    min={250}
                    max={10000}
                    step={50}
                    value={targetText}
                    onChange={(event) => setTargetText(event.target.value)}
                    className="min-h-[38px] w-full rounded-[10px] border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15"
                  />
                  <Button size="sm" onClick={() => void saveTarget()} loading={busy === "target"} icon={<Check className="h-3.5 w-3.5" />}>
                    Save
                  </Button>
                </div>
                <FieldError>{targetError ?? undefined}</FieldError>
                <p className="mt-1.5 text-[11px] text-muted">A general planning figure you can adjust — not a medical requirement.</p>
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {WATER_QUICK_ADD_ML.map((amount) => (
                <Button
                  key={amount}
                  size="sm"
                  variant="outline"
                  onClick={() => void add(amount, String(amount))}
                  loading={busy === String(amount)}
                  disabled={busy !== null}
                  icon={<Plus className="h-3.5 w-3.5" />}
                >
                  {amount} ml
                </Button>
              ))}
            </div>
            <div className="mt-2.5 flex gap-2">
              <div className="flex-1">
                <label htmlFor="water-custom" className="sr-only">
                  Custom amount in millilitres
                </label>
                <input
                  id="water-custom"
                  type="number"
                  inputMode="numeric"
                  placeholder="Custom ml"
                  min={10}
                  max={5000}
                  value={custom}
                  onChange={(event) => setCustom(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void addCustom();
                  }}
                  className={cn(
                    "min-h-[38px] w-full rounded-[10px] border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:outline-none focus:ring-4",
                    customError ? "border-danger-500 focus:ring-danger-500/15" : "border-line focus:border-brand-500 focus:ring-brand-500/15",
                  )}
                />
              </div>
              <Button size="sm" variant="secondary" onClick={() => void addCustom()} loading={busy === "custom"} disabled={busy !== null || !custom}>
                Add
              </Button>
            </div>
            <FieldError>{customError ?? undefined}</FieldError>

            {water.length > 0 && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setShowEntries((value) => !value)}
                  aria-expanded={showEntries}
                  className="text-xs font-semibold text-brand-400 hover:underline"
                >
                  {showEntries ? "Hide entries" : `Edit entries (${water.length})`}
                </button>
                {showEntries && (
                  <ul className="mt-2 space-y-1.5">
                    {water.map((entry) => (
                      <li key={entry.id} className="entry-enter flex items-center justify-between gap-2 rounded-[10px] border border-line bg-canvas px-3 py-2 text-xs">
                        {editingId === entry.id ? (
                          <>
                            <label htmlFor={`water-edit-${entry.id}`} className="sr-only">
                              Amount in millilitres
                            </label>
                            <input
                              id={`water-edit-${entry.id}`}
                              type="number"
                              value={editText}
                              onChange={(event) => setEditText(event.target.value)}
                              className="min-h-[30px] w-24 rounded-[10px] border border-line bg-surface px-2 text-xs text-ink focus:border-brand-500 focus:outline-none"
                            />
                            <div className="flex gap-1">
                              <IconButton label="Save amount" onClick={() => void saveEdit(entry.id)} disabled={busy !== null}>
                                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                              </IconButton>
                              <IconButton label="Cancel edit" onClick={() => setEditingId(null)}>
                                <X className="h-3.5 w-3.5" aria-hidden="true" />
                              </IconButton>
                            </div>
                          </>
                        ) : (
                          <>
                            <span className="text-ink">
                              <strong>{entry.amountMl} ml</strong>
                              <span className="text-muted"> · {new Date(entry.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
                            </span>
                            <div className="flex gap-1">
                              <IconButton
                                label={`Edit ${entry.amountMl} ml entry`}
                                onClick={() => {
                                  setEditingId(entry.id);
                                  setEditText(String(entry.amountMl));
                                }}
                              >
                                <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
                              </IconButton>
                              <IconButton label={`Remove ${entry.amountMl} ml entry`} onClick={() => void remove(entry.id)} danger disabled={busy !== null}>
                                {busy === `del-${entry.id}` ? <Minus className="h-3.5 w-3.5" aria-hidden="true" /> : <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
                              </IconButton>
                            </div>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
