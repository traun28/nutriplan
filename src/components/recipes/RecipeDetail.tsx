"use client";

/**
 * Phase 4 — recipe detail. The recipe itself is shared, read-only data
 * rendered by the server page; this component adds the per-user layer:
 * favourite, restriction verdict, add-to-plan (Phase 3 planner slot),
 * log (Phase 2 logger), add ingredients to grocery, and "Cooked this"
 * pantry deduction (always previewed and confirmed first).
 */
import { AlertTriangle, ArrowLeft, CalendarPlus, ChefHat, Clock, Loader2, NotebookPen, ShoppingCart, Utensils } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useKitchen } from "@/context/KitchenContext";
import { useMealPlan } from "@/context/MealPlanContext";
import { Badge, Button, Card, CardBody, SectionHeader } from "@/components/ui/core";
import { SelectField } from "@/components/ui/inputs";
import { Dialog } from "@/components/ui/Dialog";
import { Toast, useToast } from "@/components/ui/Toast";
import { FoodLogDialog } from "@/components/food-log/FoodLogDialog";
import { FavoriteButton, NotAvailable, Notice } from "@/components/recipes/recipeUi";
import { DIETARY_TYPES, allergenLabel, intoleranceLabel, labelFor, mealLabel, unitLabel, CUISINES } from "@/data/options";
import { foodCategoryLabel } from "@/services/foodLog/foodSearch";
import type { Recipe } from "@/services/recipes/recipeService";
import { formatQuantity } from "@/services/grocery/units";
import type { PlannerSlot } from "@/services/diet/config";
import { SLOT_ORDER } from "@/services/diet/config";
import type { FoodLogMealType } from "@/services/foodLog/types";

const DIFFICULTY_LABEL: Record<Recipe["difficulty"], string> = { very_easy: "Very easy", easy: "Easy", moderate: "Moderate", advanced: "Advanced" };

interface CookPreview {
  changes: { pantryId: number; name: string; before: string; after: string; deducted: string }[];
  skipped: { name: string; reason: string }[];
}

export function RecipeDetail({ recipe }: { recipe: Recipe }) {
  const { user } = useAuth();
  const kitchen = useKitchen();
  const mealPlan = useMealPlan();
  const { toast, show, dismiss } = useToast();
  const [conflict, setConflict] = useState<string | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [cookOpen, setCookOpen] = useState(false);
  const [cookPreview, setCookPreview] = useState<CookPreview | null>(null);
  const [cookBusy, setCookBusy] = useState(false);
  const [cookError, setCookError] = useState<string | null>(null);
  const [dayIndex, setDayIndex] = useState("0");
  const [slot, setSlot] = useState<PlannerSlot>(recipe.mealTypes.includes("lunch") ? "lunch" : recipe.mealTypes.includes("dinner") ? "dinner" : recipe.category === "breakfast" ? "breakfast" : "eveningSnack");
  const [planError, setPlanError] = useState<string | null>(null);
  const [servings, setServings] = useState("1");

  // Per-user verdict (restrictions + favourite) — one request, cached favourites.
  const { loadFavorites } = kitchen;
  useEffect(() => {
    if (user) void loadFavorites();
  }, [user, loadFavorites]);

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    fetch(`/api/recipes/${encodeURIComponent(recipe.id)}`, { signal: controller.signal, credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((payload: { conflict?: string | null } | null) => {
        if (payload) setConflict(payload.conflict ?? null);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [user, recipe.id]);

  const favorite = kitchen.isFavorite(recipe.id);
  const plan = mealPlan.plan;
  const days = useMemo(() => plan?.data.days.map((d) => ({ value: String(d.dayIndex), label: d.date ? `${d.label} · ${d.weekday}` : d.label })) ?? [], [plan]);
  const slotsForDay = useMemo(() => {
    const day = plan?.data.days.find((d) => String(d.dayIndex) === dayIndex);
    const present = new Set(day?.plan.meals.map((m) => m.type) ?? []);
    return SLOT_ORDER.filter((s) => present.has(s)).map((s) => ({ value: s, label: mealLabel(s) }));
  }, [plan, dayIndex]);
  const effectiveSlot = slotsForDay.some((s) => s.value === slot) ? slot : (slotsForDay[0]?.value as PlannerSlot | undefined);

  const servingsNumber = Math.min(10, Math.max(0.25, Number(servings) || 1));

  const requireAuth = (): boolean => {
    if (user) return true;
    show("Sign in to use this action.", "error");
    return false;
  };

  const toggleFavorite = async () => {
    if (!requireAuth()) return;
    const r = await kitchen.toggleFavorite(recipe.id);
    show(r.message, r.success ? "success" : "error");
  };

  const addToPlan = async () => {
    if (!effectiveSlot) return;
    setPlanError(null);
    const r = await mealPlan.replaceMeal(Number(dayIndex), effectiveSlot, recipe.id);
    if (r.success) {
      setPlanOpen(false);
      show(`${recipe.name} added to ${days.find((d) => d.value === dayIndex)?.label ?? "your plan"} · ${mealLabel(effectiveSlot)}.`, "success");
    } else {
      setPlanError(r.details?.length ? `${r.message} ${r.details.join(" ")}` : r.message);
    }
  };

  const addToGrocery = async () => {
    if (!requireAuth()) return;
    const r = await kitchen.addRecipeToGrocery(recipe.id, servingsNumber);
    show(r.message, r.success ? "success" : "error");
  };

  const previewCook = async () => {
    if (!requireAuth()) return;
    setCookOpen(true);
    setCookBusy(true);
    setCookError(null);
    setCookPreview(null);
    try {
      const r = await fetch("/api/pantry/cook", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ recipeId: recipe.id, servings: servingsNumber, confirm: false }) });
      const payload = (await r.json()) as CookPreview & { error?: string };
      if (!r.ok) throw new Error(payload.error ?? "Could not check your pantry.");
      setCookPreview({ changes: payload.changes, skipped: payload.skipped });
    } catch (e) {
      setCookError(e instanceof Error ? e.message : "Could not check your pantry.");
    } finally {
      setCookBusy(false);
    }
  };

  const confirmCook = async () => {
    setCookBusy(true);
    try {
      const r = await fetch("/api/pantry/cook", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ recipeId: recipe.id, servings: servingsNumber, confirm: true }) });
      const payload = (await r.json()) as { changes: unknown[]; error?: string };
      if (!r.ok) throw new Error(payload.error ?? "Pantry could not be updated.");
      setCookOpen(false);
      void kitchen.loadPantry(true);
      show(`Pantry updated for ${payload.changes.length} ingredient${payload.changes.length === 1 ? "" : "s"}.`, "success");
    } catch (e) {
      setCookError(e instanceof Error ? e.message : "Pantry could not be updated.");
    } finally {
      setCookBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <Link href="/recipes" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All recipes
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-400">{foodCategoryLabel(recipe.category)}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-3xl">{recipe.name}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">{recipe.description ?? <NotAvailable>Description not available for this recipe.</NotAvailable>}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge>
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              Prep {recipe.prepMinutes} min
            </Badge>
            <Badge>{recipe.cookMinutes !== null ? `Cook ${recipe.cookMinutes} min` : "Cook time not available"}</Badge>
            <Badge>{DIFFICULTY_LABEL[recipe.difficulty]}</Badge>
            {recipe.cuisines.map((c) => (
              <Badge key={c}>{labelFor(CUISINES, c)}</Badge>
            ))}
            {recipe.dietaryTypes.map((d) => (
              <Badge key={d} tone="brand">
                {labelFor(DIETARY_TYPES, d)}
              </Badge>
            ))}
          </div>
        </div>
        <FavoriteButton active={favorite} onToggle={() => void toggleFavorite()} name={recipe.name} />
      </header>

      {conflict && (
        <div className="mt-5">
          <Notice
            tone="warning"
            message={
              <span className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent-300" aria-hidden="true" />
                <span>
                  <strong>Not suitable for your profile:</strong> {conflict} It will not be added to your plan.
                </span>
              </span>
            }
          />
        </div>
      )}

      {/* Actions */}
      <div className="mt-5 flex flex-wrap items-end gap-2 rounded-card border border-line bg-surface p-4 shadow-sm">
        <label className="text-sm font-semibold text-ink">
          Servings
          <input
            type="number"
            min={0.25}
            max={10}
            step={0.25}
            value={servings}
            onChange={(e) => setServings(e.target.value)}
            className="ml-2 w-20 rounded-lg border border-line bg-canvas px-2 py-1.5 text-sm text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </label>
        <Button
          size="sm"
          icon={<CalendarPlus className="h-4 w-4" />}
          disabled={Boolean(conflict)}
          onClick={() => {
            if (!requireAuth()) return;
            if (!plan) {
              show("Generate a 7-day plan first, then add recipes to it.", "error");
              return;
            }
            setPlanError(null);
            setPlanOpen(true);
          }}
        >
          Add to meal plan
        </Button>
        <Button size="sm" variant="outline" icon={<NotebookPen className="h-4 w-4" />} onClick={() => requireAuth() && setLogOpen(true)}>
          Log this meal
        </Button>
        <Button size="sm" variant="outline" icon={<ShoppingCart className="h-4 w-4" />} onClick={() => void addToGrocery()} disabled={kitchen.busy === "grocery:recipe"}>
          Add ingredients to grocery
        </Button>
        <Button size="sm" variant="ghost" icon={<ChefHat className="h-4 w-4" />} onClick={() => void previewCook()} disabled={!recipe.ingredients} title={recipe.ingredients ? "Deduct used ingredients from your pantry" : "Ingredient quantities are not available for this recipe"}>
          Cooked this recipe
        </Button>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <Card>
            <CardBody>
              <SectionHeader title="Ingredients" description={recipe.ingredients ? `Per serving · shown for ${fmtNum(servingsNumber)} serving${servingsNumber === 1 ? "" : "s"}` : "Quantities are not available for this recipe."} />
              <ul className="mt-3 divide-y divide-line text-sm">
                {recipe.ingredients
                  ? recipe.ingredients.map((ing) => (
                      <li key={ing.name} className="flex items-baseline justify-between gap-3 py-2">
                        <span className="capitalize text-ink">
                          {ing.name}
                          {ing.note && <span className="ml-1 text-xs text-muted">({ing.note})</span>}
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums text-ink">{formatQuantity(ing.quantity * servingsNumber, ing.unit)}</span>
                      </li>
                    ))
                  : recipe.ingredientNames.map((name) => (
                      <li key={name} className="flex items-baseline justify-between gap-3 py-2">
                        <span className="capitalize text-ink">{name}</span>
                        <NotAvailable>Quantity not available</NotAvailable>
                      </li>
                    ))}
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <SectionHeader title="Method" description={recipe.steps ? `${recipe.steps.length} steps` : undefined} />
              {recipe.steps ? (
                <ol className="mt-3 space-y-3 text-sm leading-relaxed text-ink">
                  {recipe.steps.map((step, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-600">{i + 1}</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-3">
                  <NotAvailable>Cooking instructions are not available for this recipe.</NotAvailable>
                </p>
              )}
            </CardBody>
          </Card>
        </div>

        <aside className="space-y-5">
          <Card>
            <CardBody>
              <SectionHeader title="Nutrition" description={`Per serving (${recipe.servingSize.quantity} ${unitLabel(recipe.servingSize.unit)})`} />
              <dl className="mt-3 space-y-2 text-sm">
                <Row label="Calories" value={`${recipe.nutrition.calories} kcal`} />
                <Row label="Protein" value={`${recipe.nutrition.proteinGrams} g`} />
                <Row label="Carbohydrates" value={`${recipe.nutrition.carbohydrateGrams} g`} />
                <Row label="Fat" value={`${recipe.nutrition.fatGrams} g`} />
                <Row label="Fibre" value={<NotAvailable>Not available</NotAvailable>} />
              </dl>
              {servingsNumber !== 1 && (
                <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-xs text-muted">
                  {fmtNum(servingsNumber)} servings ≈ {Math.round(recipe.nutrition.calories * servingsNumber)} kcal · {Math.round(recipe.nutrition.proteinGrams * servingsNumber)} g protein
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <SectionHeader title="Allergens & suitability" />
              <div className="mt-3 space-y-3 text-sm">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">Contains</p>
                  {recipe.allergens.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {recipe.allergens.map((a) => (
                        <Badge key={a} tone="warning">
                          {allergenLabel(a)}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-muted">No common allergens listed in our data. Always check your ingredient labels.</p>
                  )}
                </div>
                {recipe.intoleranceFlags.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">Intolerance flags</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {recipe.intoleranceFlags.map((f) => (
                        <Badge key={f}>{intoleranceLabel(f)}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">Suitable meal types</p>
                  <p className="mt-1 text-ink">{recipe.mealTypes.map(foodCategoryLabel).join(", ")}</p>
                </div>
                {recipe.tags.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">Tags</p>
                    <p className="mt-1 text-muted">{recipe.tags.map((t) => t.replace(/_/g, " ")).join(" · ")}</p>
                  </div>
                )}
              </div>
            </CardBody>
          </Card>
        </aside>
      </div>

      {/* Add to plan */}
      <Dialog
        open={planOpen}
        title="Add to your 7-day plan"
        description={plan ? `Choose where “${recipe.name}” goes in “${plan.name}”. The meal currently in that slot will be replaced and the day re-checked against your restrictions.` : ""}
        onClose={() => setPlanOpen(false)}
        busy={mealPlan.busy !== null}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPlanOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void addToPlan()} disabled={!effectiveSlot || mealPlan.busy !== null} icon={mealPlan.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Utensils className="h-4 w-4" />}>
              Add to plan
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label="Day" value={dayIndex} onChange={setDayIndex} options={days} />
          <SelectField label="Meal" value={effectiveSlot ?? ""} onChange={(v) => setSlot(v as PlannerSlot)} options={slotsForDay} hint={slotsForDay.length === 0 ? "This day has no meal slots." : undefined} />
        </div>
        {planError && (
          <p role="alert" className="mt-3 rounded-lg border border-danger-500/30 bg-danger-50/60 px-3 py-2 text-sm text-danger-700">
            {planError}
          </p>
        )}
      </Dialog>

      {/* Cooked this recipe */}
      <Dialog
        open={cookOpen}
        title="Update pantry after cooking?"
        description={`Ingredients for ${fmtNum(servingsNumber)} serving${servingsNumber === 1 ? "" : "s"} of ${recipe.name} will be deducted from matching pantry items. Nothing changes until you confirm.`}
        onClose={() => setCookOpen(false)}
        busy={cookBusy}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCookOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void confirmCook()} disabled={cookBusy || !cookPreview || cookPreview.changes.length === 0}>
              Confirm deduction
            </Button>
          </>
        }
      >
        {cookBusy && !cookPreview && (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Checking your pantry…
          </p>
        )}
        {cookError && (
          <p role="alert" className="rounded-lg border border-danger-500/30 bg-danger-50/60 px-3 py-2 text-sm text-danger-700">
            {cookError}
          </p>
        )}
        {cookPreview && (
          <div className="space-y-3 text-sm">
            {cookPreview.changes.length === 0 ? (
              <p className="text-muted">None of this recipe&apos;s ingredients are in your pantry with a comparable quantity, so there is nothing to deduct.</p>
            ) : (
              <ul className="divide-y divide-line">
                {cookPreview.changes.map((c) => (
                  <li key={c.pantryId} className="flex items-center justify-between gap-3 py-2">
                    <span className="capitalize text-ink">{c.name}</span>
                    <span className="tabular-nums text-muted">
                      {c.before} → <strong className="text-ink">{c.after}</strong>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {cookPreview.skipped.length > 0 && (
              <p className="text-xs text-muted">Not adjusted: {cookPreview.skipped.map((s) => `${s.name} (${s.reason})`).join("; ")}.</p>
            )}
          </div>
        )}
      </Dialog>

      <FoodLogDialog open={logOpen} onClose={() => setLogOpen(false)} defaultFoodId={recipe.id} defaultServings={servingsNumber} defaultMealType={recipe.category === "breakfast" ? "breakfast" : recipe.category === "lunch" ? "lunch" : recipe.category === "dinner" ? "dinner" : (undefined as FoodLogMealType | undefined)} onSaved={() => show(`${recipe.name} logged.`, "success")} />

      <Toast toast={toast} onDismiss={dismiss} />
    </div>
  );
}

function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}
