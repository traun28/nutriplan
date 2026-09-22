"use client";

/**
 * Phase 4 — pantry page. Private per-user inventory (name, quantity, unit,
 * category, expiry, notes) with search/filter, quick quantity updates,
 * "mark used", storage reminders for items near their date, and recipe
 * suggestions built from what's on hand (restriction-filtered on the server).
 *
 * Layout: one main content area — search + category filter above the
 * pantry results. Recipe suggestions sit in a compact section below the
 * list; there is no secondary column of empty space.
 */
import {
  CalendarClock,
  ChefHat,
  Loader2,
  Minus,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useKitchen } from "@/context/KitchenContext";
import {
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
} from "@/components/ui/core";
import { SelectField, TextAreaField, TextField } from "@/components/ui/inputs";
import { Dialog } from "@/components/ui/Dialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Toast, useToast } from "@/components/ui/Toast";
import { Notice, PageShell } from "@/components/recipes/recipeUi";
import {
  GROCERY_CATEGORY_ORDER,
  groceryCategoryLabel,
} from "@/data/recipes/ingredientCatalog";
import {
  GROCERY_UNITS,
  formatQuantity,
  type GroceryUnit,
} from "@/services/grocery/units";
import type { PantryItemRecord } from "@/services/server/kitchenRepository";
import type { RecipeSummary } from "@/services/recipes/recipeService";
import { toDateKey } from "@/services/foodLog/calculations";
import { cn } from "@/lib/cn";

const UNIT_OPTIONS = [
  { value: "", label: "No unit" },
  ...GROCERY_UNITS.map((u) => ({ value: u.id, label: u.label })),
];
const CATEGORY_OPTIONS = GROCERY_CATEGORY_ORDER.map((c) => ({
  value: c.id,
  label: c.label,
}));

interface Suggestion {
  recipe: RecipeSummary;
  matched: string[];
  missing: string[];
  coverage: number;
}

function daysUntil(dateKey: string, today: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return Math.round(
    (Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000,
  );
}

export function PantryManager() {
  const kitchen = useKitchen();
  const { loadPantry } = kitchen;
  const { toast, show, dismiss } = useToast();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [editing, setEditing] = useState<PantryItemRecord | null | "new">(null);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [suggestStatus, setSuggestStatus] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const today = useMemo(() => toDateKey(new Date()), []);

  // `loadPantry` is referentially stable, so this runs once per user and can
  // never loop on status changes or repeated failures.
  useEffect(() => {
    void loadPantry();
  }, [loadPantry]);

  const items = useMemo(() => kitchen.pantry ?? [], [kitchen.pantry]);

  // Suggestions depend only on the set of pantry names; refetch when it changes.
  const nameKey = useMemo(
    () =>
      items
        .map((i) => i.name)
        .sort()
        .join("|"),
    [items],
  );
  useEffect(() => {
    if (kitchen.pantryStatus !== "ready") return;
    const controller = new AbortController();
    // Deferred so the state update is not synchronous inside the effect body.
    const timer = setTimeout(() => {
      if (!nameKey) {
        setSuggestions([]);
        setSuggestStatus("idle");
        return;
      }
      setSuggestStatus("loading");
      fetch("/api/pantry/suggestions", {
        signal: controller.signal,
        credentials: "same-origin",
      })
        .then(async (r) => {
          if (!r.ok) throw new Error();
          const payload = (await r.json()) as { suggestions: Suggestion[] };
          setSuggestions(payload.suggestions);
          setSuggestStatus("idle");
        })
        .catch(() => {
          if (!controller.signal.aborted) setSuggestStatus("error");
        });
    }, 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [nameKey, kitchen.pantryStatus]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (i) =>
        (category === "all" || i.category === category) &&
        (!q || i.name.includes(q) || (i.notes ?? "").toLowerCase().includes(q)),
    );
  }, [items, query, category]);

  // Slim dividers inside one list — categories are never separate panels.
  const grouped = useMemo(() => {
    const map = new Map<string, PantryItemRecord[]>();
    for (const item of filtered)
      map.set(item.category, [...(map.get(item.category) ?? []), item]);
    return GROCERY_CATEGORY_ORDER.filter((c) => map.has(c.id)).map((c) => ({
      ...c,
      items: map.get(c.id)!,
    }));
  }, [filtered]);

  const expiring = useMemo(
    () =>
      items
        .filter((i) => i.expiresOn && daysUntil(i.expiresOn, today) <= 3)
        .sort((a, b) => a.expiresOn!.localeCompare(b.expiresOn!)),
    [items, today],
  );

  return (
    <PageShell
      eyebrow="Kitchen"
      title="My Pantry"
      intro="Keep track of what you already have. Pantry quantities are subtracted from your grocery list when units match, and recipes you can make from what's on hand show up below."
      badges={
        items.length > 0 ? (
          <>
            <Badge tone="brand">
              <Package className="h-3.5 w-3.5" aria-hidden="true" />
              {items.length} item{items.length === 1 ? "" : "s"}
            </Badge>
            {expiring.length > 0 && (
              <Badge tone="warning">{expiring.length} to use soon</Badge>
            )}
          </>
        ) : null
      }
    >
      {kitchen.pantryStatus === "error" && (
        <Notice
          tone="error"
          message={kitchen.pantryError}
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => void kitchen.loadPantry(true)}
            >
              Retry
            </Button>
          }
        />
      )}

      {expiring.length > 0 && (
        <Notice
          tone="warning"
          message={
            <span className="flex items-start gap-2">
              <CalendarClock
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <span>
                <strong>Storage reminder:</strong>{" "}
                {expiring
                  .map(
                    (i) =>
                      `${i.name} (${daysUntil(i.expiresOn!, today) < 0 ? "date passed" : daysUntil(i.expiresOn!, today) === 0 ? "today" : `${daysUntil(i.expiresOn!, today)} d`})`,
                  )
                  .join(", ")}
                . These are the dates you entered — check the items yourself
                before using them.
              </span>
            </span>
          }
        />
      )}

      {/* search + category filter (one compact toolbar) */}
      <div className="grid gap-3 rounded-card border border-line bg-surface p-4 shadow-sm sm:grid-cols-[1fr_180px_auto] sm:items-end">
        <TextField
          label="Search pantry"
          value={query}
          onChange={setQuery}
          placeholder="Search by name or note…"
          icon={<Search className="h-4 w-4" aria-hidden="true" />}
          autoComplete="off"
        />
        <SelectField
          label="Category"
          value={category}
          onChange={setCategory}
          options={[
            { value: "all", label: "All categories" },
            ...CATEGORY_OPTIONS,
          ]}
        />
        <Button
          onClick={() => setEditing("new")}
          icon={<Plus className="h-4 w-4" />}
        >
          Add item
        </Button>
      </div>

      {/* main pantry results */}
      {kitchen.pantryStatus === "loading" && kitchen.pantry === null && (
        <div className="mt-4 space-y-3" aria-busy="true" aria-label="Loading pantry">
          <div className="skeleton h-10" />
          <div className="skeleton h-28" />
        </div>
      )}

      {kitchen.pantry !== null && items.length === 0 && (
        <EmptyState
          className="mt-4"
          icon={<Package className="h-6 w-6" aria-hidden="true" />}
          title="Your pantry is empty"
          description="Add staples like rice, oats, lentils or eggs. NutriPlan will use them to trim your grocery list and suggest recipes."
          action={
            <Button
              onClick={() => setEditing("new")}
              icon={<Plus className="h-4 w-4" />}
            >
              Add your first item
            </Button>
          }
        />
      )}
      {items.length > 0 && filtered.length === 0 && (
        <p className="mt-4 rounded-card border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
          {category === "all"
            ? "No pantry items match your search."
            : `No ${groceryCategoryLabel(category).toLowerCase()} pantry items${query.trim() ? " match your search" : " yet"}.`}
        </p>
      )}

      {filtered.length > 0 && (
        <Card className="mt-4">
          <CardBody className="p-4 sm:p-5">
            <h2 className="flex items-center justify-between text-sm font-bold text-ink">
              Pantry items
              <span className="text-xs font-semibold text-muted">
                {filtered.length} shown
              </span>
            </h2>
            <div className="mt-2">
              {grouped.map((group) => (
                <section key={group.id} aria-label={group.label}>
                  <h3 className="mt-3 border-b border-line pb-1 text-xs font-bold uppercase tracking-wide text-brand-500 first:mt-0">
                    {group.label}
                    <span className="ml-2 font-semibold normal-case tracking-normal text-muted">
                      {group.items.length}
                    </span>
                  </h3>
                  <ul className="divide-y divide-line">
                    {group.items.map((item) => (
                      <PantryRow
                        key={item.id}
                        item={item}
                        today={today}
                        onEdit={() => setEditing(item)}
                        onMessage={show}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* cook with what you have — compact section below the results */}
      <Card className="mt-4">
        <CardBody className="p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
            <ChefHat className="h-4 w-4 text-brand-500" aria-hidden="true" />{" "}
            Cook with what you have
          </h2>
          {items.length === 0 && (
            <p className="mt-1 text-xs text-muted">
              Add a few pantry items to see recipe ideas.
            </p>
          )}
          {suggestStatus === "loading" && (
            <p className="mt-2 flex items-center gap-2 text-xs text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />{" "}
              Finding recipes…
            </p>
          )}
          {suggestStatus === "error" && (
            <p className="mt-2 text-xs text-danger-700">
              Suggestions could not be loaded.
            </p>
          )}
          {suggestions &&
            items.length > 0 &&
            suggestions.length === 0 &&
            suggestStatus === "idle" && (
              <p className="mt-1 text-xs text-muted">
                No recipes use these ingredients yet. Try adding staples like
                rice, oats, lentils, paneer or eggs.
              </p>
            )}
          {suggestions && suggestions.length > 0 && (
            <>
              <p className="mt-1 text-xs text-muted">
                You have {suggestions[0].matched.slice(0, 3).join(", ")}… here&apos;s
                what fits your profile:
              </p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {suggestions.map((s) => (
                  <li
                    key={s.recipe.id}
                    className="rounded-lg border border-line bg-canvas p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/recipes/${s.recipe.id}`}
                        className="text-sm font-semibold text-ink hover:text-brand-600"
                      >
                        {s.recipe.name}
                      </Link>
                      <Badge tone={s.coverage >= 75 ? "brand" : undefined}>
                        {s.coverage}% on hand
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {s.recipe.calories} kcal · {s.recipe.proteinGrams} g protein
                      {s.missing.length > 0 && (
                        <>
                          {" "}
                          · missing: {s.missing.slice(0, 3).join(", ")}
                          {s.missing.length > 3 ? "…" : ""}
                        </>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardBody>
      </Card>

      <PantryDialog
        key={editing === "new" ? "new" : (editing?.id ?? "closed")}
        item={editing === "new" ? null : editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onMessage={show}
      />
      <Toast toast={toast} onDismiss={dismiss} />
    </PageShell>
  );
}

/* ------------------------------ row ------------------------------ */

function PantryRow({
  item,
  today,
  onEdit,
  onMessage,
}: {
  item: PantryItemRecord;
  today: string;
  onEdit: () => void;
  onMessage: (m: string, tone?: "success" | "error") => void;
}) {
  const kitchen = useKitchen();
  const [confirm, setConfirm] = useState<"delete" | "used" | null>(null);
  const busy =
    kitchen.busy === `pantry:update:${item.id}` ||
    kitchen.busy === `pantry:delete:${item.id}`;
  const days = item.expiresOn ? daysUntil(item.expiresOn, today) : null;

  const step =
    item.unit === "g" || item.unit === "ml"
      ? 50
      : item.unit === "kg" || item.unit === "l"
        ? 0.25
        : 1;
  const adjust = async (delta: number) => {
    if (item.quantity === null || !item.unit) return;
    const next = Math.max(0, Math.round((item.quantity + delta) * 100) / 100);
    const r = await kitchen.updatePantryItem(item.id, {
      quantity: next,
      unit: item.unit,
    });
    if (!r.success) onMessage(r.message, "error");
  };

  return (
    <li className="flex items-start gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-semibold capitalize text-ink">
            {item.name}
          </span>
          <span className="text-sm tabular-nums text-muted">
            {item.quantity !== null && item.unit ? (
              formatQuantity(item.quantity, item.unit)
            ) : (
              <em>no quantity</em>
            )}
          </span>
          {item.quantity === 0 && <Badge tone="warning">Out</Badge>}
          {days !== null && (
            <Badge tone={days <= 3 ? "warning" : undefined}>
              {days < 0
                ? "Date passed"
                : days === 0
                  ? "Use today"
                  : days === 1
                    ? "1 day left"
                    : `${days} days left`}
            </Badge>
          )}
        </div>
        {item.notes && <p className="mt-0.5 text-xs text-muted">{item.notes}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {item.quantity !== null && item.unit && (
          <div className="mr-1 hidden items-center rounded-lg border border-line sm:inline-flex">
            <button
              type="button"
              onClick={() => void adjust(-step)}
              disabled={busy || item.quantity === 0}
              className="p-1.5 text-muted hover:text-ink disabled:opacity-40"
              aria-label={`Decrease ${item.name} by ${step} ${item.unit}`}
            >
              <Minus className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => void adjust(step)}
              disabled={busy}
              className="border-l border-line p-1.5 text-muted hover:text-ink disabled:opacity-40"
              aria-label={`Increase ${item.name} by ${step} ${item.unit}`}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => setConfirm("used")}
          disabled={busy}
          className="whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold text-muted hover:bg-canvas hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
          aria-label={`Mark ${item.name} as used up`}
        >
          Used up
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md p-1.5 text-muted hover:bg-canvas hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
          aria-label={`Edit ${item.name}`}
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setConfirm("delete")}
          className="rounded-md p-1.5 text-muted hover:bg-danger-50 hover:text-danger-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
          aria-label={`Remove ${item.name}`}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
      <ConfirmDialog
        open={confirm !== null}
        title={
          confirm === "delete"
            ? `Remove ${item.name}?`
            : `Mark ${item.name} as used up?`
        }
        description={
          confirm === "delete"
            ? "It will be removed from your pantry."
            : "The item is removed from your pantry so it counts toward your next grocery list."
        }
        confirmLabel={confirm === "delete" ? "Remove" : "Used up"}
        tone="danger"
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          setConfirm(null);
          const r = await kitchen.deletePantryItem(item.id);
          onMessage(
            r.success
              ? confirm === "used"
                ? `${item.name} marked as used.`
                : r.message
              : r.message,
            r.success ? "success" : "error",
          );
        }}
      />
    </li>
  );
}

/* ----------------------------- dialog ----------------------------- */

function PantryDialog({
  item,
  open,
  onClose,
  onMessage,
}: {
  item: PantryItemRecord | null;
  open: boolean;
  onClose: () => void;
  onMessage: (m: string, tone?: "success" | "error") => void;
}) {
  const kitchen = useKitchen();
  const [name, setName] = useState(item?.name ?? "");
  const [qty, setQty] = useState(
    item?.quantity === null || item?.quantity === undefined
      ? ""
      : String(item.quantity),
  );
  const [unit, setUnit] = useState<string>(item?.unit ?? "");
  const [category, setCategory] = useState(item?.category ?? "");
  const [expiresOn, setExpiresOn] = useState(item?.expiresOn ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const busy =
    kitchen.busy === "pantry:add" ||
    (item !== null && kitchen.busy === `pantry:update:${item.id}`);

  const submit = async () => {
    if (!name.trim()) {
      setError("Enter a name.");
      return;
    }
    if ((qty && !unit) || (!qty && unit)) {
      setError("Enter both a quantity and a unit, or leave both empty.");
      return;
    }
    setError(null);
    const payload = {
      name: name.trim(),
      quantity: qty ? Number(qty) : null,
      unit: (unit || null) as GroceryUnit | null,
      category: category || undefined,
      expiresOn: expiresOn || null,
      notes: notes || null,
    };
    const r = item
      ? await kitchen.updatePantryItem(item.id, payload)
      : await kitchen.addPantryItem(payload);
    if (r.success) {
      onMessage(r.message, "success");
      onClose();
    } else setError(r.message);
  };

  return (
    <Dialog
      open={open}
      title={item ? `Edit ${item.name}` : "Add pantry item"}
      description="Quantities are optional — items without one still count for recipe suggestions."
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={onClose}
            icon={<X className="h-4 w-4" />}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={busy}
            icon={
              busy ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined
            }
          >
            {item ? "Save changes" : "Add to pantry"}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <TextField
            label="Name"
            value={name}
            onChange={setName}
            placeholder="e.g. basmati rice"
            maxLength={60}
            required
            autoFocus
          />
        </div>
        <TextField
          label="Quantity"
          value={qty}
          onChange={setQty}
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          placeholder="Optional"
        />
        <SelectField
          label="Unit"
          value={unit}
          onChange={setUnit}
          options={UNIT_OPTIONS}
        />
        <SelectField
          label="Category"
          value={category}
          onChange={setCategory}
          options={[{ value: "", label: "Auto-detect" }, ...CATEGORY_OPTIONS]}
        />
        <TextField
          label="Use by (optional)"
          value={expiresOn}
          onChange={setExpiresOn}
          type="date"
          hint="Shown as a storage reminder only."
        />
        <div className="sm:col-span-2">
          <TextAreaField
            label="Notes (optional)"
            value={notes}
            onChange={setNotes}
            maxLength={200}
            rows={2}
            placeholder="e.g. opened on Monday, in the fridge door"
          />
        </div>
      </div>
      {error && (
        <p
          role="alert"
          className={cn(
            "mt-3 rounded-lg border border-danger-500/30 bg-danger-50/60 px-3 py-2 text-sm text-danger-700",
          )}
        >
          {error}
        </p>
      )}
    </Dialog>
  );
}
