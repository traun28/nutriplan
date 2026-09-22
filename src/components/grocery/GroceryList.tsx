"use client";

/**
 * Phase 4 — grocery list page. Generated from the user's saved 7-day plan
 * (whole week or selected days), grouped by category, with per-item
 * purchase toggles, quantity edits, custom items, clear-purchased,
 * regenerate, print and CSV export. All state is persisted via /api/grocery.
 */
import { CalendarDays, Check, Download, Eraser, ListChecks, Loader2, Package, Pencil, Plus, Printer, RefreshCw, ShoppingCart, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useKitchen } from "@/context/KitchenContext";
import { useMealPlan } from "@/context/MealPlanContext";
import { Badge, Button, Card, CardBody, EmptyState } from "@/components/ui/core";
import { SelectField, TextField } from "@/components/ui/inputs";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Toast, useToast } from "@/components/ui/Toast";
import { Notice, PageShell } from "@/components/recipes/recipeUi";
import { GROCERY_CATEGORY_ORDER, groceryCategoryLabel } from "@/data/recipes/ingredientCatalog";
import { GROCERY_UNITS, formatQuantity, type GroceryUnit } from "@/services/grocery/units";
import type { GroceryItemRecord } from "@/services/server/kitchenRepository";
import { cn } from "@/lib/cn";

const UNIT_OPTIONS = [{ value: "", label: "No unit" }, ...GROCERY_UNITS.map((u) => ({ value: u.id, label: u.label }))];
const CATEGORY_OPTIONS = GROCERY_CATEGORY_ORDER.map((c) => ({ value: c.id, label: c.label }));

export function GroceryList() {
  const kitchen = useKitchen();
  const mealPlan = useMealPlan();
  const { toast, show, dismiss } = useToast();
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [usePantry, setUsePantry] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [hidePurchased, setHidePurchased] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);

  useEffect(() => {
    void kitchen.loadGrocery();
  }, [kitchen]);

  const list = kitchen.grocery;
  const plan = mealPlan.plan;
  const items = useMemo(() => list?.items ?? [], [list]);

  const grouped = useMemo(() => {
    const map = new Map<string, GroceryItemRecord[]>();
    for (const item of items) {
      if (hidePurchased && item.purchased) continue;
      const bucket = map.get(item.category) ?? [];
      bucket.push(item);
      map.set(item.category, bucket);
    }
    return GROCERY_CATEGORY_ORDER.filter((c) => map.has(c.id)).map((c) => ({ ...c, items: map.get(c.id)! }));
  }, [items, hidePurchased]);

  const purchasedCount = useMemo(() => items.filter((i) => i.purchased).length, [items]);
  const progress = items.length ? Math.round((purchasedCount / items.length) * 100) : 0;

  const generate = async (dayIndexes: number[] | null) => {
    const r = await kitchen.generateGrocery({ dayIndexes, usePantry });
    if (r.success) {
      const covered = r.data?.coveredByPantry ?? [];
      show(covered.length ? `${r.message} ${covered.length} item${covered.length === 1 ? "" : "s"} already covered by your pantry.` : r.message, "success");
    } else show(r.message, "error");
  };

  const exportCsv = () => {
    const rows = [["Category", "Item", "Quantity", "Unit", "Purchased", "Used in"]];
    for (const item of items) {
      rows.push([groceryCategoryLabel(item.category), item.name, item.quantity === null ? "" : String(item.quantity), item.unit ?? "", item.purchased ? "yes" : "no", item.sources.map((s) => `${s.dayLabel} ${s.mealLabel}`.trim()).join("; ")]);
    }
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nutriplan-grocery-list.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const generatedLabel = list?.generatedAt
    ? `Generated ${new Date(list.generatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}${list.dayIndexes ? ` · ${list.dayIndexes.length} day${list.dayIndexes.length === 1 ? "" : "s"}` : " · whole week"}`
    : null;

  const toggleDay = (d: number) => setSelectedDays((s) => (s.includes(d) ? s.filter((x) => x !== d) : [...s, d].sort((a, b) => a - b)));

  return (
    <PageShell
      eyebrow="Shopping"
      title="Grocery List"
      intro="Everything you need for your 7-day plan, combined across meals and grouped by aisle. Tick items off as you shop — your progress is saved."
      badges={
        list && items.length > 0 ? (
          <>
            <Badge tone="brand">
              <ShoppingCart className="h-3.5 w-3.5" aria-hidden="true" />
              {purchasedCount}/{items.length} purchased
            </Badge>
            {generatedLabel && <Badge>{generatedLabel}</Badge>}
          </>
        ) : null
      }
    >
      {kitchen.groceryStatus === "error" && <Notice tone="error" message={kitchen.groceryError} action={<Button size="sm" variant="outline" onClick={() => void kitchen.loadGrocery(true)}>Retry</Button>} />}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div>
          {kitchen.groceryStatus === "loading" && !list && <div className="h-72 animate-pulse rounded-card bg-line/30" />}

          {list && items.length === 0 && (
            <EmptyState
              icon={<ShoppingCart className="h-6 w-6" aria-hidden="true" />}
              title="Your grocery list is empty"
              description={plan ? `Generate it from “${plan.name}” — ingredients from every meal are combined into one list.` : "Generate a 7-day meal plan first; the grocery list is built from its recipes."}
              action={
                plan ? (
                  <Button onClick={() => void generate(null)} disabled={kitchen.busy !== null} icon={kitchen.busy === "grocery:generate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />}>
                    Generate for the whole week
                  </Button>
                ) : (
                  <Button href="/meal-plan" icon={<CalendarDays className="h-4 w-4" />}>
                    Open the 7-day planner
                  </Button>
                )
              }
            />
          )}

          {list && items.length > 0 && (
            <>
              <div className="mb-4 rounded-card border border-line bg-surface p-4 shadow-sm print:hidden">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold text-ink">{progress}% done</span>
                  <label className="inline-flex items-center gap-2 text-muted">
                    <input type="checkbox" checked={hidePurchased} onChange={(e) => setHidePurchased(e.target.checked)} className="h-4 w-4 rounded border-line text-brand-500 focus:ring-brand-300" />
                    Hide purchased
                  </label>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-line/60" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Shopping progress">
                  <div className="h-full rounded-full bg-brand-500 transition-[width]" style={{ width: `${progress}%` }} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" icon={<Plus className="h-4 w-4" />} onClick={() => setCustomOpen((o) => !o)} aria-expanded={customOpen}>
                    Add item
                  </Button>
                  <Button size="sm" variant="outline" icon={<Eraser className="h-4 w-4" />} onClick={() => setConfirmClear(true)} disabled={purchasedCount === 0 || kitchen.busy !== null}>
                    Clear purchased
                  </Button>
                  <Button size="sm" variant="ghost" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
                    Print
                  </Button>
                  <Button size="sm" variant="ghost" icon={<Download className="h-4 w-4" />} onClick={exportCsv}>
                    Export CSV
                  </Button>
                </div>
                {customOpen && <CustomItemForm onDone={() => setCustomOpen(false)} />}
              </div>

              {grouped.length === 0 && <p className="rounded-card border border-dashed border-line p-6 text-center text-sm text-muted">Everything is purchased. Nice work!</p>}

              <div className="space-y-4">
                {grouped.map((group) => (
                  <Card key={group.id}>
                    <CardBody>
                      <h2 className="flex items-center justify-between text-sm font-bold uppercase tracking-wide text-brand-500">
                        {group.label}
                        <span className="text-xs font-semibold normal-case tracking-normal text-muted">{group.items.length}</span>
                      </h2>
                      <ul className="mt-2 divide-y divide-line">
                        {group.items.map((item) => (
                          <GroceryRow key={item.id} item={item} onMessage={show} />
                        ))}
                      </ul>
                    </CardBody>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Generation controls */}
        <aside className="space-y-4 print:hidden">
          <Card>
            <CardBody>
              <h2 className="text-sm font-bold text-ink">Generate from your plan</h2>
              {plan ? (
                <>
                  <p className="mt-1 text-xs text-muted">Plan: {plan.name}. Pick specific days or use the whole week.</p>
                  <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Days to include">
                    {plan.data.days.map((d) => {
                      const on = selectedDays.includes(d.dayIndex);
                      return (
                        <button
                          key={d.dayIndex}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggleDay(d.dayIndex)}
                          className={cn(
                            "rounded-pill border px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300",
                            on ? "border-brand-500 bg-brand-500 text-white" : "border-line bg-canvas text-muted hover:text-ink",
                          )}
                        >
                          {d.weekday ?? d.label}
                        </button>
                      );
                    })}
                  </div>
                  <label className="mt-3 inline-flex items-center gap-2 text-sm text-ink">
                    <input type="checkbox" checked={usePantry} onChange={(e) => setUsePantry(e.target.checked)} className="h-4 w-4 rounded border-line text-brand-500 focus:ring-brand-300" />
                    Subtract what&apos;s in my pantry
                  </label>
                  <div className="mt-3 flex flex-col gap-2">
                    <Button size="sm" onClick={() => (items.length > 0 ? setConfirmRegen(true) : void generate(selectedDays.length ? selectedDays : null))} disabled={kitchen.busy !== null} icon={kitchen.busy === "grocery:generate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}>
                      {selectedDays.length ? `Generate for ${selectedDays.length} day${selectedDays.length === 1 ? "" : "s"}` : items.length ? "Regenerate whole week" : "Generate whole week"}
                    </Button>
                    {selectedDays.length > 0 && (
                      <Button size="sm" variant="ghost" onClick={() => setSelectedDays([])}>
                        Use whole week
                      </Button>
                    )}
                  </div>
                  <p className="mt-3 text-xs text-muted">Regenerating replaces plan-derived items but keeps your custom items and remembers what you already ticked.</p>
                </>
              ) : (
                <p className="mt-1 text-xs text-muted">
                  No saved 7-day plan yet. <a href="/meal-plan" className="font-semibold text-brand-600 hover:underline">Generate one</a> and come back.
                </p>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
                <Package className="h-4 w-4 text-brand-500" aria-hidden="true" /> How quantities work
              </h2>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-muted">
                <li>Only ingredients measured in compatible units are combined (grams with kilograms, millilitres with litres, pieces with pieces).</li>
                <li>Recipes without ingredient quantities appear as “quantity not available” rather than a guess.</li>
                <li>Pantry stock is subtracted only when its unit can be compared; otherwise the full amount is shown.</li>
              </ul>
            </CardBody>
          </Card>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Clear purchased items?"
        description={`${purchasedCount} ticked item${purchasedCount === 1 ? "" : "s"} will be removed from the list.`}
        confirmLabel="Clear"
        tone="danger"
        onCancel={() => setConfirmClear(false)}
        onConfirm={async () => {
          setConfirmClear(false);
          const r = await kitchen.clearPurchased();
          show(r.message, r.success ? "success" : "error");
        }}
      />
      <ConfirmDialog
        open={confirmRegen}
        title="Regenerate the grocery list?"
        description="Plan-derived items are rebuilt from your current 7-day plan. Custom items are kept, and items you already ticked stay ticked."
        confirmLabel="Regenerate"
        tone="brand"
        onCancel={() => setConfirmRegen(false)}
        onConfirm={() => {
          setConfirmRegen(false);
          void generate(selectedDays.length ? selectedDays : null);
        }}
      />
      <Toast toast={toast} onDismiss={dismiss} />
    </PageShell>
  );
}

/* ------------------------------ row ------------------------------ */

function GroceryRow({ item, onMessage }: { item: GroceryItemRecord; onMessage: (m: string, tone?: "success" | "error") => void }) {
  const kitchen = useKitchen();
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState(item.quantity === null ? "" : String(item.quantity));
  const [unit, setUnit] = useState<string>(item.unit ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputId = `g-${item.id}`;

  const save = async () => {
    const r = await kitchen.updateGroceryItem(item.id, { quantity: qty === "" ? null : Number(qty), unit: (unit || null) as GroceryUnit | null });
    onMessage(r.message, r.success ? "success" : "error");
    if (r.success) setEditing(false);
  };

  const usedIn = item.sources.filter((s) => s.dayIndex >= 0).map((s) => `${s.dayLabel} ${s.mealLabel}`);
  const fromRecipes = item.sources.filter((s) => s.dayIndex < 0).map((s) => s.recipeName);

  return (
    <li className={cn("flex items-start gap-3 py-2.5", item.purchased && "opacity-60")}>
      <input
        id={inputId}
        type="checkbox"
        checked={item.purchased}
        onChange={(e) => void kitchen.updateGroceryItem(item.id, { purchased: e.target.checked })}
        className="mt-1 h-4 w-4 shrink-0 rounded border-line text-brand-500 focus:ring-brand-300"
        aria-label={`Mark ${item.name} as ${item.purchased ? "not purchased" : "purchased"}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <label htmlFor={inputId} className={cn("text-sm font-semibold capitalize text-ink", item.purchased && "line-through")}>
            {item.name}
          </label>
          {!editing && (
            <span className="text-sm tabular-nums text-muted">
              {item.quantity !== null && item.unit ? (item.quantity === 0 && item.pantryQuantity ? <em>covered by pantry</em> : formatQuantity(item.quantity, item.unit)) : item.unquantified ? <em>quantity not available</em> : null}
              {item.quantity !== null && item.unquantified && <em title="Some recipes using this ingredient do not list a quantity."> + more</em>}
            </span>
          )}
          {item.isCustom && <Badge>Custom</Badge>}
          {item.quantity === 0 && item.pantryQuantity ? <Badge tone="brand">In pantry</Badge> : null}
        </div>
        {editing && (
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="text-xs font-semibold text-muted">
              Quantity
              <input type="number" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} className="mt-1 block w-24 rounded-lg border border-line bg-canvas px-2 py-1.5 text-sm text-ink" />
            </label>
            <label className="text-xs font-semibold text-muted">
              Unit
              <select value={unit} onChange={(e) => setUnit(e.target.value)} className="mt-1 block rounded-lg border border-line bg-canvas px-2 py-1.5 text-sm text-ink">
                {UNIT_OPTIONS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </label>
            <Button size="sm" onClick={() => void save()} icon={<Check className="h-4 w-4" />}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} icon={<X className="h-4 w-4" />}>
              Cancel
            </Button>
          </div>
        )}
        {(item.pantryQuantity !== null || item.pantryUncomparable || item.requiredQuantity !== null) && !item.isCustom && (
          <p className="mt-0.5 text-xs text-muted">
            {item.pantryUncomparable
              ? "In your pantry, but units can't be compared — full amount shown."
              : item.pantryQuantity !== null && item.requiredQuantity !== null && item.unit
                ? `Recipes need ${formatQuantity(item.requiredQuantity, item.unit)}; ${formatQuantity(item.pantryQuantity, item.unit)} already in your pantry.`
                : null}
          </p>
        )}
        {(usedIn.length > 0 || fromRecipes.length > 0) && (
          <p className="mt-0.5 truncate text-xs text-muted" title={[...usedIn, ...fromRecipes].join(", ")}>
            {usedIn.length > 0 ? `Used in: ${usedIn.slice(0, 3).join(", ")}${usedIn.length > 3 ? ` +${usedIn.length - 3} more` : ""}` : `From recipe: ${Array.from(new Set(fromRecipes)).join(", ")}`}
          </p>
        )}
      </div>
      <div className="flex shrink-0 gap-1 print:hidden">
        <button type="button" onClick={() => setEditing((e) => !e)} className="rounded-md p-1.5 text-muted hover:bg-canvas hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300" aria-label={`Edit quantity for ${item.name}`}>
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => setConfirmDelete(true)} className="rounded-md p-1.5 text-muted hover:bg-danger-50 hover:text-danger-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300" aria-label={`Remove ${item.name}`}>
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title={`Remove ${item.name}?`}
        description={item.isCustom ? "This custom item will be deleted from your list." : "It will be removed until you regenerate the list from your plan."}
        confirmLabel="Remove"
        tone="danger"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          const r = await kitchen.deleteGroceryItem(item.id);
          onMessage(r.message, r.success ? "success" : "error");
        }}
      />
    </li>
  );
}

/* --------------------------- custom item --------------------------- */

function CustomItemForm({ onDone }: { onDone: () => void }) {
  const kitchen = useKitchen();
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Enter an item name.");
      return;
    }
    if ((qty && !unit) || (!qty && unit)) {
      setError("Enter both a quantity and a unit, or leave both empty.");
      return;
    }
    setError(null);
    const r = await kitchen.addGroceryItems([{ name: name.trim(), category: category || undefined, quantity: qty ? Number(qty) : null, unit: (unit || null) as GroceryUnit | null }]);
    if (r.success) {
      setName("");
      setQty("");
      setUnit("");
      onDone();
    } else setError(r.message);
  };

  return (
    <form onSubmit={submit} className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-[1fr_100px_120px_150px_auto] sm:items-end">
      <TextField label="Item" value={name} onChange={setName} placeholder="e.g. lemons" maxLength={60} required />
      <TextField label="Qty" value={qty} onChange={setQty} type="number" inputMode="decimal" min={0} step="any" />
      <SelectField label="Unit" value={unit} onChange={setUnit} options={UNIT_OPTIONS} />
      <SelectField label="Category" value={category} onChange={setCategory} options={[{ value: "", label: "Auto" }, ...CATEGORY_OPTIONS]} />
      <Button type="submit" size="sm" disabled={kitchen.busy !== null} icon={kitchen.busy === "grocery:add" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}>
        Add
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger-700 sm:col-span-5">
          {error}
        </p>
      )}
    </form>
  );
}
