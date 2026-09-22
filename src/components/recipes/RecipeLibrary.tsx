"use client";

/**
 * Phase 4 — recipe library: search + filters over the shared read-only
 * recipe data (/api/recipes). Filters only exist for data the recipes
 * actually carry (meal type, cuisine, dietary type, prep time, calories,
 * protein, difficulty). Results are fetched with a debounce; favourites
 * come from KitchenContext.
 */
import { BookOpen, Filter, Heart, Loader2, Search, ShieldCheck, X } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useProfile } from "@/context/ProfileContext";
import { useKitchen } from "@/context/KitchenContext";
import { Badge, Button, EmptyState } from "@/components/ui/core";
import { SelectField, TextField } from "@/components/ui/inputs";
import { Toast, useToast } from "@/components/ui/Toast";
import { Notice, PageShell, RecipeCard } from "@/components/recipes/recipeUi";
import { CUISINES, DIETARY_TYPES } from "@/data/options";
import { FOOD_CATEGORY_OPTIONS } from "@/services/foodLog/foodSearch";
import type { RecipeSummary } from "@/services/recipes/recipeService";
import { cn } from "@/lib/cn";

const DIFFICULTIES = [
  { value: "all", label: "Any difficulty" },
  { value: "very_easy", label: "Very easy" },
  { value: "easy", label: "Easy" },
  { value: "moderate", label: "Moderate" },
  { value: "advanced", label: "Advanced" },
];
const PREP = [
  { value: "", label: "Any prep time" },
  { value: "10", label: "≤ 10 min" },
  { value: "20", label: "≤ 20 min" },
  { value: "30", label: "≤ 30 min" },
  { value: "45", label: "≤ 45 min" },
];
const CALS = [
  { value: "", label: "Any calories" },
  { value: "200", label: "≤ 200 kcal" },
  { value: "350", label: "≤ 350 kcal" },
  { value: "500", label: "≤ 500 kcal" },
];
const PROTEIN = [
  { value: "", label: "Any protein" },
  { value: "10", label: "≥ 10 g" },
  { value: "15", label: "≥ 15 g" },
  { value: "20", label: "≥ 20 g" },
];

interface Filters {
  q: string;
  mealType: string;
  cuisine: string;
  dietaryType: string;
  maxPrep: string;
  maxCalories: string;
  minProtein: string;
  difficulty: string;
}

const DEFAULTS: Filters = { q: "", mealType: "all", cuisine: "all", dietaryType: "all", maxPrep: "", maxCalories: "", minProtein: "", difficulty: "all" };

export function RecipeLibrary() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const kitchen = useKitchen();
  const { toast, show, dismiss } = useToast();
  const [filters, setFilters] = useState<Filters>(DEFAULTS);
  const [view, setView] = useState<"all" | "favorites">("all");
  const [safeOnly, setSafeOnly] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [recipes, setRecipes] = useState<RecipeSummary[] | null>(null);
  const [hidden, setHidden] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(filters.q);

  const hasRestrictions = Boolean(profile && (profile.allergies.length > 0 || profile.intolerances.length > 0 || profile.dietaryPreferences.dietaryType || profile.foodsToAvoid.length > 0));

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (deferredQuery.trim()) p.set("q", deferredQuery.trim());
    if (filters.mealType !== "all") p.set("mealType", filters.mealType);
    if (filters.cuisine !== "all") p.set("cuisine", filters.cuisine);
    if (filters.dietaryType !== "all") p.set("dietaryType", filters.dietaryType);
    if (filters.maxPrep) p.set("maxPrep", filters.maxPrep);
    if (filters.maxCalories) p.set("maxCalories", filters.maxCalories);
    if (filters.minProtein) p.set("minProtein", filters.minProtein);
    if (filters.difficulty !== "all") p.set("difficulty", filters.difficulty);
    if (user && safeOnly && hasRestrictions) p.set("safe", "1");
    if (view === "favorites") p.set("favorites", "1");
    return p.toString();
  }, [deferredQuery, filters, user, safeOnly, hasRestrictions, view]);

  // Favourites are cached in context so toggles reflect everywhere.
  const { loadFavorites } = kitchen;
  useEffect(() => {
    if (user) void loadFavorites();
  }, [user, loadFavorites]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus("loading");
      try {
        const response = await fetch(`/api/recipes?${params}`, { signal: controller.signal, credentials: "same-origin" });
        const payload = (await response.json()) as { recipes?: RecipeSummary[]; hidden?: number; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Recipes could not be loaded.");
        setRecipes(payload.recipes ?? []);
        setHidden(payload.hidden ?? 0);
        setError(null);
        setStatus("ready");
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Recipes could not be loaded.");
        setStatus("error");
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [params]);

  // Favourite view: drop cards optimistically when unsaved.
  const visible = useMemo(() => {
    if (!recipes) return null;
    if (view !== "favorites" || kitchen.favoriteIds === null) return recipes;
    return recipes.filter((r) => kitchen.favoriteIds!.includes(r.id));
  }, [recipes, view, kitchen.favoriteIds]);

  const activeFilterCount = Object.entries(filters).filter(([k, v]) => k !== "q" && v !== DEFAULTS[k as keyof Filters]).length;
  const set = (key: keyof Filters) => (value: string) => setFilters((f) => ({ ...f, [key]: value }));

  const toggle = async (id: string) => {
    if (!user) {
      show("Sign in to save recipes.", "success");
      return;
    }
    const result = await kitchen.toggleFavorite(id);
    show(result.message, result.success ? "success" : "error");
  };

  return (
    <PageShell
      eyebrow="Recipe library"
      title="Recipes"
      intro="Browse every recipe NutriPlan can plan with, see its nutrition and ingredients, save favourites, and add any recipe to your 7-day plan or food log."
      badges={
        <>
          <Badge>
            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
            {recipes ? `${recipes.length} shown` : "Loading…"}
          </Badge>
          {user && hasRestrictions && safeOnly && (
            <Badge tone="brand">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Matching your restrictions
            </Badge>
          )}
        </>
      }
    >
      {/* Search + view toggle */}
      <div className="rounded-card border border-line bg-surface p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
          <TextField
            id="recipe-search"
            label="Search recipes"
            value={filters.q}
            onChange={set("q")}
            placeholder="Name, ingredient, tag or cuisine…"
            icon={<Search className="h-4 w-4" aria-hidden="true" />}
            autoComplete="off"
          />
          <div className="flex gap-2">
            <div role="tablist" aria-label="Recipe set" className="inline-flex rounded-pill border border-line bg-canvas p-1">
              {(["all", "favorites"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => {
                    if (v === "favorites" && !user) {
                      show("Sign in to see your saved recipes.", "success");
                      return;
                    }
                    setView(v);
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300",
                    view === v ? "bg-brand-500 text-white shadow-sm" : "text-muted hover:text-ink",
                  )}
                >
                  {v === "favorites" && <Heart className="h-3.5 w-3.5" aria-hidden="true" />}
                  {v === "all" ? "All recipes" : "Saved"}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters} aria-controls="recipe-filters" icon={<Filter className="h-4 w-4" />}>
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </Button>
          </div>
        </div>

        {showFilters && (
          <div id="recipe-filters" className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-4">
            <SelectField label="Meal type" value={filters.mealType} onChange={set("mealType")} options={FOOD_CATEGORY_OPTIONS.map((o) => ({ value: o.id, label: o.id === "all" ? "Any meal type" : o.label }))} />
            <SelectField label="Cuisine" value={filters.cuisine} onChange={set("cuisine")} options={[{ value: "all", label: "Any cuisine" }, ...CUISINES.map((c) => ({ value: c.id, label: c.label }))]} />
            <SelectField label="Dietary type" value={filters.dietaryType} onChange={set("dietaryType")} options={[{ value: "all", label: "Any dietary type" }, ...DIETARY_TYPES.map((d) => ({ value: d.id, label: d.label }))]} />
            <SelectField label="Difficulty" value={filters.difficulty} onChange={set("difficulty")} options={DIFFICULTIES} />
            <SelectField label="Prep time" value={filters.maxPrep} onChange={set("maxPrep")} options={PREP} />
            <SelectField label="Calories per serving" value={filters.maxCalories} onChange={set("maxCalories")} options={CALS} />
            <SelectField label="Protein per serving" value={filters.minProtein} onChange={set("minProtein")} options={PROTEIN} />
            <div className="flex flex-col justify-end gap-2">
              {user && hasRestrictions && (
                <label className="inline-flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" checked={safeOnly} onChange={(e) => setSafeOnly(e.target.checked)} className="h-4 w-4 rounded border-line text-brand-500 focus:ring-brand-300" />
                  Hide recipes that conflict with my profile
                </label>
              )}
              {(activeFilterCount > 0 || filters.q) && (
                <Button variant="ghost" size="sm" onClick={() => setFilters(DEFAULTS)} icon={<X className="h-4 w-4" />}>
                  Clear filters
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {hidden > 0 && (
        <div className="mt-4">
          <Notice
            tone="info"
            message={`${hidden} recipe${hidden === 1 ? "" : "s"} hidden because ${hidden === 1 ? "it conflicts" : "they conflict"} with your allergies, intolerances, dietary type or disliked foods.`}
            action={
              <Button size="sm" variant="ghost" onClick={() => setSafeOnly(false)}>
                Show anyway
              </Button>
            }
          />
        </div>
      )}

      <div className="mt-5" aria-live="polite" aria-busy={status === "loading"}>
        {status === "error" && (
          <Notice tone="error" message={error} action={<Button size="sm" variant="outline" onClick={() => setFilters((f) => ({ ...f }))}>Retry</Button>} />
        )}
        {status === "loading" && visible === null && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-56 animate-pulse rounded-card bg-line/30" />
            ))}
          </div>
        )}
        {visible && visible.length === 0 && status !== "loading" && (
          <EmptyState
            icon={view === "favorites" ? <Heart className="h-6 w-6" aria-hidden="true" /> : <Search className="h-6 w-6" aria-hidden="true" />}
            title={view === "favorites" ? "No saved recipes yet" : "No recipes match these filters"}
            description={view === "favorites" ? "Tap the heart on any recipe to save it here." : "Try a broader search, or clear a filter or two."}
            action={
              view === "favorites" ? (
                <Button onClick={() => setView("all")}>Browse all recipes</Button>
              ) : (
                <Button variant="outline" onClick={() => setFilters(DEFAULTS)}>
                  Clear filters
                </Button>
              )
            }
          />
        )}
        {visible && visible.length > 0 && (
          <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", status === "loading" && "opacity-60 transition-opacity")}>
            {visible.map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe} favorite={kitchen.isFavorite(recipe.id)} onToggleFavorite={() => void toggle(recipe.id)} />
            ))}
          </div>
        )}
        {status === "loading" && visible && visible.length > 0 && (
          <p className="mt-3 flex items-center gap-2 text-xs text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Updating results…
          </p>
        )}
      </div>

      <Toast toast={toast} onDismiss={dismiss} />
    </PageShell>
  );
}
