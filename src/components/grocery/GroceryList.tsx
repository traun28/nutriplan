"use client";

/**
 * Phase 4 — grocery list page. Generated from the user's saved 7-day plan
 * (whole week or selected days), filtered by category, with per-item purchase
 * toggles, quantity edits, custom items, clear-purchased, regenerate, print and
 * CSV export. All state is persisted via /api/grocery.
 *
 * Layout is deliberately ONE column:
 *
 *     page header → category selector → main grocery list
 *
 * It used to be a `[1fr_320px]` grid, which left a tall near-empty left column
 * next to a second large column of controls whenever the list was short, and
 * rendered every category as its own full-width card. Categories are now a
 * real filter (`selectedCategory`): picking one replaces the list with only
 * that category's items, so nothing is duplicated into a sidebar and there is
 * never a giant blank panel.
 */
import { CalendarDays, Check, ChevronDown, Download, Eraser, Info, ListChecks, Loader2, Package, Pencil, Plus, Printer, RefreshCw, ShoppingCart, Trash2, X } from "lucide-react";
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

/** "All" plus every real category — the selector is driven by data, not hard-coded. */
const CATEGORY_FILTERS = [{ id: "all", label: "All" }, ...GROCERY_CATEGORY_ORDER];

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
  /** The one piece of state the whole list is filtered by. */
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  /** `null` = not decided yet, so the generate panel opens while the list is empty. */
  const [generateOpen, setGenerateOpen] = useState<boolean | null>(null);

  // Depends on the loader only — never on the whole context object, whose
  // identity changes with every status/data update and used to re-trigger
  // this effect in a loop (one failing request after another).
  const loadGrocery = kitchen.loadGrocery;
  useEffect(() => {
    void loadGrocery();
  }, [loadGrocery]);

  const list = kitchen.grocery;
  const plan = mealPlan.plan;
  const items = useMemo(() => list?.items ?? [], [list]);

  /* Items actually on screen: category filter + the "hide purchased" toggle. */
  const visibleItems = useMemo(
    () =>
      items.filter(
        (item) =>
          (!hidePurchased || !item.purchased) &&
          (selectedCategory === "all" || item.category === selectedCategory),
      ),
    [items, hidePurchased, selectedCategory],
  );

  /* Per-category counts, so the selector shows what each filter will reveal. */
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      if (hidePurchased && item.purchased) continue;
      map.set(item.category, (map.get(item.category) ?? 0) + 1);
    }
    return map;
  }, [items, hidePurchased]);

  const visibleTotal = useMemo(
    () => (hidePurchased ? items.filter((i) => !i.purchased).length : items.length),
    [items, hidePurchased],
  );

  const purchasedCount = useMemo(() => items.filter((i) => i.purchased).length, [items]);
  const progress = items.length ? Math.round((purchasedCount / items.length) * 100) : 0;
  const activeCategoryLabel =
    selectedCategory === "all" ? "All" : groceryCategoryLabel(selectedCategory);
  const showGenerate = generateOpen ?? items.length === 0;

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
      intro="Everything you need for your 7-day plan, combined across meals. Filter by category and tick items off as you shop — your progress is saved."
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

      {/* ------------------------------ toolbar ------------------------------ */}
      {list && items.length > 0 && (
        <Card className="mb-4 print:hidden">
          <CardBody className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <div className="flex min-w-0 items-center gap-3">
                <span className="text-sm font-semibold whitespace-nowrap text-ink">{progress}% done</span>
                <div className="h-2 w-full max-w-56 min-w-16 overflow-hidden rounded-full bg-line/60" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Shopping progress">
                  <div className="h-full rounded-full bg-brand-500 transition-[width]" style={{ width: `${progress}%` }} />
                </div>
              </div>
              <label className="inline-flex shrink-0 items-center gap-2 text-sm whitespace-nowrap text-muted">
                <input type="checkbox" checked={hidePurchased} onChange={(e) => setHidePurchased(e.target.checked)} className="h-4 w-4 rounded border-line text-brand-500 focus:ring-brand-500" />
                Hide purchased
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" icon={<Plus className="h-4 w-4" />} onClick={() => setCustomOpen((o) => !o)} aria-expanded={customOpen}>
                Add item
              </Button>
              <Button size="sm" variant="outline" icon={<Eraser className="h-4 w-4" />} onClick={() => setConfirmClear(true)} disabled={purchasedCount === 0 || kitchen.busy !== null}>
                Clear purchased
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setGenerateOpen(!showGenerate)}
                aria-expanded={showGenerate}
                icon={<ChevronDown className={cn("h-4 w-4 transition-transform", showGenerate && "rotate-180")} />}
              >
                {showGenerate ? "Hide generate options" : "Generate from plan"}
              </Button>
              <Button size="sm" variant="ghost" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
                Print
              </Button>
              <Button size="sm" variant="ghost" icon={<Download className="h-4 w-4" />} onClick={exportCsv}>
                Export CSV
              </Button>
            </div>

            {customOpen && <CustomItemForm onDone={() => setCustomOpen(false)} />}
            {showGenerate && <GeneratePanel plan={plan} selectedDays={selectedDays} onUsePantryChange={setUsePantry} usePantryValue={usePantry} toggleDay={toggleDay} hasItems={items.length > 0} onClearDays={() => setSelectedDays([])} onGenerate={generate} busy={kitchen.busy !== null} generating={kitchen.busy === "grocery:generate"} onRegenerate={() => setConfirmRegen(true)} />}
          </CardBody>
        </Card>
      )}

      {/* ------------------------- loading (compact) ------------------------- */}
      {kitchen.groceryStatus === "loading" && !list && (
        <div aria-busy="true" aria-label="Loading grocery list" role="status">
          <Card>
            <CardBody className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-9" />
              ))}
            </CardBody>
          </Card>
        </div>
      )}

      {/* ------------------------ empty list (no items) ---------------------- */}
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

      {/* Generate controls still need to be reachable before anything exists. */}
      {list && items.length === 0 && plan && (
        <Card className="mt-4 print:hidden">
          <CardBody>
            <GeneratePanel plan={plan} selectedDays={selectedDays} onUsePantryChange={setUsePantry} usePantryValue={usePantry} toggleDay={toggleDay} hasItems={false} onClearDays={() => setSelectedDays([])} onGenerate={generate} busy={kitchen.busy !== null} generating={kitchen.busy === "grocery:generate"} onRegenerate={() => setConfirmRegen(true)} />
          </CardBody>
        </Card>
      )}

      {list && items.length > 0 && (
        <>
          {/* ------------------------ category selector ------------------------ */}
          <div role="group" aria-label="Filter grocery items by category" className="mb-4 flex flex-wrap items-center gap-1.5 print:hidden">
            {CATEGORY_FILTERS.map((filter) => {
              const count = filter.id === "all" ? visibleTotal : (counts.get(filter.id) ?? 0);
              const active = selectedCategory === filter.id;
              return (
                <button
                  key={filter.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelectedCategory(filter.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-sm font-semibold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                    active
                      ? "border-brand-700 bg-brand-700 text-white shadow-[0_4px_12px_rgba(5,150,105,0.28)]"
                      : "border-line bg-surface text-muted hover:border-brand-400/50 hover:text-ink",
                  )}
                >
                  {filter.label}
                  <span className={cn("rounded-pill px-1.5 text-[11px] font-bold tabular-nums", active ? "bg-white/20 text-white" : "bg-canvas text-muted")}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* --------------------------- main list --------------------------- */}
          {visibleItems.length === 0 ? (
            /* Compact, specific empty state — never a tall blank rectangle. */
            <p className="rounded-card border border-dashed border-line bg-surface/60 px-5 py-6 text-center text-sm text-muted">
              {hidePurchased && (counts.get(selectedCategory) ?? 0) > 0
                ? `All ${activeCategoryLabel} items are purchased. Nice work!`
                : `No ${activeCategoryLabel} grocery items yet.`}
            </p>
          ) : (
            <Card>
              <CardBody className="p-0">
                <h2 className="flex items-center justify-between gap-2 border-b border-line px-4 py-3 text-sm font-bold tracking-wide text-brand-500 uppercase sm:px-5">
                  <span className="truncate">{selectedCategory === "all" ? "All items" : activeCategoryLabel}</span>
                  <span className="shrink-0 text-xs font-semibold tracking-normal text-muted normal-case">
                    {visibleItems.length} item{visibleItems.length === 1 ? "" : "s"}
                  </span>
                </h2>
                <ul className="divide-y divide-line px-4 sm:px-5">
                  {visibleItems.map((item) => (
                    <GroceryRow key={item.id} item={item} showCategory={selectedCategory === "all"} onMessage={show} />
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          {/* Kept from the original sidebar, as a compact disclosure. */}
          <details className="mt-4 rounded-card border border-line bg-surface print:hidden">
            <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-bold text-ink select-none sm:px-5">
              <Package className="h-4 w-4 shrink-0 text-brand-500" aria-hidden="true" />
              How quantities work
            </summary>
            <ul className="list-disc space-y-1 px-4 pb-4 pl-9 text-xs leading-relaxed text-muted sm:px-5 sm:pl-10">
              <li>Only ingredients measured in compatible units are combined (grams with kilograms, millilitres with litres, pieces with pieces).</li>
              <li>Recipes without ingredient quantities appear as “quantity not available” rather than a guess.</li>
              <li>Pantry stock is subtracted only when its unit can be compared; otherwise the full amount is shown.</li>
            </ul>
          </details>
        </>
      )}

      {/* No plan at all — say so once, compactly, instead of an empty column. */}
      {list && items.length === 0 && !plan && (
        <p className="mt-4 flex items-start gap-2 rounded-card border border-line bg-surface px-4 py-3 text-sm text-muted">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" aria-hidden="true" />
          <span>
            No saved 7-day plan yet.{" "}
            <a href="/meal-plan" className="font-semibold text-brand-600 hover:underline">
              Generate one
            </a>{" "}
            and the grocery list is built from its recipes.
          </span>
        </p>
      )}

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

/* ------------------------- generate from plan ------------------------- */

interface GeneratePanelProps {
  plan: ReturnType<typeof useMealPlan>["plan"];
  selectedDays: number[];
  usePantryValue: boolean;
  onUsePantryChange: (value: boolean) => void;
  toggleDay: (day: number) => void;
  hasItems: boolean;
  onClearDays: () => void;
  onGenerate: (days: number[] | null) => void | Promise<void>;
  onRegenerate: () => void;
  busy: boolean;
  generating: boolean;
}

/** The generation controls, inline — not in a second column of their own. */
function GeneratePanel({ plan, selectedDays, usePantryValue, onUsePantryChange, toggleDay, hasItems, onClearDays, onGenerate, onRegenerate, busy, generating }: GeneratePanelProps) {
  if (!plan) {
    return (
      <p className="rounded-[10px] bg-canvas px-3.5 py-3 text-xs leading-relaxed text-muted">
        No saved 7-day plan yet.{" "}
        <a href="/meal-plan" className="font-semibold text-brand-600 hover:underline">
          Generate one
        </a>{" "}
        and come back.
      </p>
    );
  }

  return (
    <div className="rounded-[10px] border border-line bg-canvas p-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-ink">Generate from your plan</h2>
        <p className="text-xs text-muted">Plan: {plan.name}</p>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label="Days to include">
        {plan.data.days.map((d) => {
          const on = selectedDays.includes(d.dayIndex);
          return (
            <button
              key={d.dayIndex}
              type="button"
              aria-pressed={on}
              onClick={() => toggleDay(d.dayIndex)}
              className={cn(
                "rounded-pill border px-3 py-1 text-xs font-semibold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                on ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-surface text-muted hover:text-ink",
              )}
            >
              {d.weekday ?? d.label}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={usePantryValue} onChange={(e) => onUsePantryChange(e.target.checked)} className="h-4 w-4 rounded border-line text-brand-500 focus:ring-brand-500" />
          Subtract what&apos;s in my pantry
        </label>
        <div className="flex flex-wrap gap-2">
          {selectedDays.length > 0 && (
            <Button size="sm" variant="ghost" onClick={onClearDays}>
              Use whole week
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => (hasItems && selectedDays.length === 0 ? onRegenerate() : void onGenerate(selectedDays.length ? selectedDays : null))}
            disabled={busy}
            icon={generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          >
            {selectedDays.length
              ? `Generate for ${selectedDays.length} day${selectedDays.length === 1 ? "" : "s"}`
              : hasItems
                ? "Regenerate whole week"
                : "Generate whole week"}
          </Button>
        </div>
      </div>

      <p className="mt-2.5 text-xs leading-relaxed text-muted">
        Regenerating replaces plan-derived items but keeps your custom items and remembers what you already ticked.
      </p>
    </div>
  );
}

/* ------------------------------ row ------------------------------ */

function GroceryRow({ item, showCategory, onMessage }: { item: GroceryItemRecord; showCategory: boolean; onMessage: (m: string, tone?: "success" | "error") => void }) {
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
        className="mt-1 h-4 w-4 shrink-0 rounded border-line text-brand-500 focus:ring-brand-500"
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
          {/* Only in the "All" view — a selected category makes it redundant. */}
          {showCategory && <Badge>{groceryCategoryLabel(item.category)}</Badge>}
          {item.isCustom && <Badge>Custom</Badge>}
          {item.quantity === 0 && item.pantryQuantity ? <Badge tone="brand">In pantry</Badge> : null}
        </div>
        {editing && (
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="text-xs font-semibold text-muted">
              Quantity
              <input type="number" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} className="mt-1 block w-24 rounded-[10px] border border-line bg-canvas px-2 py-1.5 text-sm text-ink" />
            </label>
            <label className="text-xs font-semibold text-muted">
              Unit
              <select value={unit} onChange={(e) => setUnit(e.target.value)} className="mt-1 block rounded-[10px] border border-line bg-canvas px-2 py-1.5 text-sm text-ink">
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
        <button type="button" onClick={() => setEditing((e) => !e)} className="rounded-[10px] p-1.5 text-muted hover:bg-canvas hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label={`Edit quantity for ${item.name}`}>
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => setConfirmDelete(true)} className="rounded-[10px] p-1.5 text-muted hover:bg-danger-50 hover:text-danger-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label={`Remove ${item.name}`}>
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
    <form onSubmit={submit} className="grid gap-2 border-t border-line pt-3 sm:grid-cols-2 sm:items-end lg:grid-cols-[minmax(0,1fr)_100px_120px_150px_auto]">
      <TextField label="Item" value={name} onChange={setName} placeholder="e.g. lemons" maxLength={60} required />
      <TextField label="Qty" value={qty} onChange={setQty} type="number" inputMode="decimal" min={0} step="any" />
      <SelectField label="Unit" value={unit} onChange={setUnit} options={UNIT_OPTIONS} />
      <SelectField label="Category" value={category} onChange={setCategory} options={[{ value: "", label: "Auto" }, ...CATEGORY_OPTIONS]} />
      <Button type="submit" size="sm" disabled={kitchen.busy !== null} icon={kitchen.busy === "grocery:add" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}>
        Add
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger-700 sm:col-span-2 lg:col-span-5">
          {error}
        </p>
      )}
    </form>
  );
}
