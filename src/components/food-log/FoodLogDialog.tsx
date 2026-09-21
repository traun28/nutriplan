"use client";

/**
 * Phase 2 — Log Food / Edit Food dialog.
 *
 * Flow: date + meal → search (all / recent / favourites / category) →
 * select food → serving quantity → live nutrition preview → save.
 * The same component edits an existing entry when `entry` is passed.
 *
 * Nutrition preview uses the shared `scaleFood` helper, which is exactly
 * what the server uses when the entry is saved.
 */
import {
  Check,
  ChevronLeft,
  Clock,
  Heart,
  History,
  Minus,
  Plus,
  Search,
  Star,
  UtensilsCrossed,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FoodCategory, FoodItemRecord } from "@/types/profile";
import { useDayLog } from "@/context/DayLogContext";
import { Badge, Button, FieldError, FieldLabel } from "@/components/ui/core";
import { SelectField, TimeField } from "@/components/ui/inputs";
import { Dialog } from "@/components/ui/Dialog";
import { allergenLabel, DIETARY_TYPES, labelFor, unitLabel } from "@/data/options";
import { titleCase } from "@/lib/normalize";
import { cn } from "@/lib/cn";
import { findFood, nowTimeKey, scaleFood, toDateKey } from "@/services/foodLog/calculations";
import { FOOD_CATEGORY_OPTIONS, foodCategoryLabel, searchFoods } from "@/services/foodLog/foodSearch";
import {
  FOOD_LOG_MEAL_TYPES,
  type FoodLogEntry,
  type FoodLogMealType,
} from "@/services/foodLog/types";
import {
  SERVINGS_MAX,
  SERVINGS_MIN,
  validateCreate,
  type FieldErrors,
} from "@/services/foodLog/validation";
import { roundTo } from "@/lib/numbers";

type Source = "all" | "recent" | "favorites";

interface FoodLogDialogProps {
  open: boolean;
  onClose: () => void;
  /** When set, the dialog edits this entry instead of creating one. */
  entry?: FoodLogEntry | null;
  /** Defaults for a new entry. */
  defaultDate?: string;
  defaultMealType?: FoodLogMealType;
  /** Pre-select a food (e.g. from "Repeat" or a recent chip). */
  defaultFoodId?: string;
  defaultServings?: number;
  onSaved?: (entry: FoodLogEntry, mode: "create" | "edit") => void;
}

const QUICK_SERVINGS = [0.5, 1, 1.5, 2];
const MAX_DATE = toDateKey();

export function FoodLogDialog({
  open,
  onClose,
  entry = null,
  defaultDate,
  defaultMealType,
  defaultFoodId,
  defaultServings,
  onSaved,
}: FoodLogDialogProps) {
  const { addEntry, updateEntry, recentIds, favoriteIds, toggleFavorite, isFavorite, selectedDate } = useDayLog();
  const isEdit = entry !== null;

  const [logDate, setLogDate] = useState("");
  const [mealType, setMealType] = useState<FoodLogMealType | "">("");
  const [loggedTime, setLoggedTime] = useState("");
  const [foodId, setFoodId] = useState<string | null>(null);
  const [servingsText, setServingsText] = useState("1");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<Source>("all");
  const [category, setCategory] = useState<FoodCategory | "all">("all");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Reset the form each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    const task = setTimeout(() => {
      setLogDate(entry?.logDate ?? defaultDate ?? selectedDate);
      setMealType(entry?.mealType ?? defaultMealType ?? suggestMealType());
      setLoggedTime(entry?.loggedTime ?? (defaultDate && defaultDate !== toDateKey() ? "" : nowTimeKey()));
      setFoodId(entry?.foodId ?? defaultFoodId ?? null);
      setServingsText(String(entry?.servings ?? defaultServings ?? 1));
      setQuery("");
      setSource("all");
      setCategory("all");
      setErrors({});
      setSaveError(null);
      setSaving(false);
    }, 0);
    return () => clearTimeout(task);
  }, [open, entry, defaultDate, defaultMealType, defaultFoodId, defaultServings, selectedDate]);

  const servings = useMemo(() => {
    const parsed = Number(servingsText.replace(",", "."));
    return Number.isFinite(parsed) ? roundTo(parsed, 2) : NaN;
  }, [servingsText]);

  const food = foodId ? findFood(foodId) : undefined;
  const preview = food && Number.isFinite(servings) && servings > 0 ? scaleFood(food, servings) : null;

  const results = useMemo(() => {
    const onlyIds =
      source === "recent" ? new Set(recentIds) : source === "favorites" ? new Set(favoriteIds) : undefined;
    const list = searchFoods(query, { category, onlyIds, limit: 60 });
    if (source === "recent" && !query) {
      // Preserve recency order for the recent tab.
      const order = new Map(recentIds.map((id, index) => [id, index]));
      return [...list].sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
    }
    return list;
  }, [query, source, category, recentIds, favoriteIds]);

  const adjustServings = (delta: number) => {
    const base = Number.isFinite(servings) ? servings : 1;
    const next = Math.min(SERVINGS_MAX, Math.max(SERVINGS_MIN, roundTo(base + delta, 2)));
    setServingsText(String(next));
  };

  const close = useCallback(() => {
    if (saving) return;
    onClose();
  }, [saving, onClose]);

  const submit = async () => {
    if (saving) return;
    setSaveError(null);
    const input = {
      logDate,
      mealType: mealType as FoodLogMealType,
      foodId: foodId ?? "",
      servings,
      loggedTime: loggedTime || null,
    };
    const validation = validateCreate(input);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSaving(true);
    const result = isEdit && entry
      ? await updateEntry(entry.id, input)
      : await addEntry(input);
    setSaving(false);
    if (!result.ok) {
      setSaveError(result.message);
      return;
    }
    onSaved?.(result.data, isEdit ? "edit" : "create");
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      busy={saving}
      size="lg"
      title={isEdit ? "Edit food entry" : "Log food"}
      description={
        isEdit
          ? "Change the food, quantity, meal or date. Totals update as soon as you save."
          : "Choose a food, set the quantity and save it to your day."
      }
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-xs text-muted" aria-live="polite">
            {preview ? (
              <>
                <strong className="text-ink">{preview.calories} kcal</strong> · P {preview.proteinGrams} g · C{" "}
                {preview.carbohydrateGrams} g · F {preview.fatGrams} g
              </>
            ) : (
              "Select a food to preview nutrition."
            )}
          </div>
          <div className="flex gap-2.5">
            <Button variant="outline" onClick={close} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={() => void submit()}
              loading={saving}
              disabled={saving || !food}
              icon={<Check className="h-4 w-4" />}
            >
              {saving ? "Saving…" : isEdit ? "Save changes" : "Save to my day"}
            </Button>
          </div>
        </div>
      }
    >
      {saveError && (
        <div
          role="alert"
          className="mb-4 rounded-[10px] border border-danger-500/30 bg-danger-50/60 px-4 py-3 text-sm text-danger-700"
        >
          {saveError}
        </div>
      )}

      {/* ------------------------ when + which meal ------------------------ */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <FieldLabel htmlFor="food-log-date" required>
            Date
          </FieldLabel>
          <input
            id="food-log-date"
            type="date"
            value={logDate}
            max={MAX_DATE}
            onChange={(event) => setLogDate(event.target.value)}
            aria-invalid={errors.logDate ? true : undefined}
            aria-describedby={errors.logDate ? "food-log-date-error" : undefined}
            className={cn(
              "min-h-[42px] w-full rounded-[10px] border bg-surface px-3.5 py-2.5 text-sm text-ink transition-[border-color,box-shadow] duration-200 focus:outline-none focus:ring-4",
              errors.logDate
                ? "border-danger-500 focus:ring-danger-500/15"
                : "border-line hover:border-brand-400/50 focus:border-brand-500 focus:ring-brand-500/15",
            )}
          />
          <FieldError id="food-log-date-error">{errors.logDate}</FieldError>
        </div>
        <SelectField
          id="food-log-meal"
          label="Meal"
          required
          value={mealType}
          onChange={(value) => setMealType(value as FoodLogMealType)}
          options={FOOD_LOG_MEAL_TYPES.map((meal) => ({ value: meal.id, label: meal.label }))}
          placeholder="Choose a meal"
          error={errors.mealType}
        />
        <TimeField
          id="food-log-time"
          label="Time"
          hint="optional"
          value={loggedTime}
          onChange={setLoggedTime}
          error={errors.loggedTime}
        />
      </div>

      {/* ------------------------------ food ------------------------------ */}
      <div className="mt-5">
        {food ? (
          <SelectedFoodPanel
            food={food}
            favorite={isFavorite(food.id)}
            onToggleFavorite={() => void toggleFavorite(food.id)}
            onChange={() => {
              setFoodId(null);
              setErrors((current) => ({ ...current, foodId: undefined }));
            }}
          />
        ) : (
          <>
            <FieldLabel htmlFor="food-log-search" required>
              Food
            </FieldLabel>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <input
                id="food-log-search"
                data-autofocus
                type="search"
                autoComplete="off"
                placeholder="Search foods, e.g. oats, dal, chicken…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="min-h-[42px] w-full rounded-[10px] border border-line bg-surface py-2.5 pl-10 pr-3.5 text-sm text-ink placeholder:text-muted/70 transition-[border-color,box-shadow] duration-200 hover:border-brand-400/50 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15"
              />
            </div>
            <FieldError>{errors.foodId}</FieldError>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div role="tablist" aria-label="Food source" className="flex flex-wrap gap-1.5">
                <SourceTab active={source === "all"} onClick={() => setSource("all")} icon={<Search className="h-3.5 w-3.5" />}>
                  All foods
                </SourceTab>
                <SourceTab
                  active={source === "recent"}
                  onClick={() => setSource("recent")}
                  icon={<History className="h-3.5 w-3.5" />}
                  count={recentIds.length}
                >
                  Recent
                </SourceTab>
                <SourceTab
                  active={source === "favorites"}
                  onClick={() => setSource("favorites")}
                  icon={<Star className="h-3.5 w-3.5" />}
                  count={favoriteIds.length}
                >
                  Favourites
                </SourceTab>
              </div>
              <div className="ml-auto w-full sm:w-auto">
                <label htmlFor="food-log-category" className="sr-only">
                  Category
                </label>
                <select
                  id="food-log-category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value as FoodCategory | "all")}
                  className="w-full rounded-pill border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:border-brand-400/50 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15 sm:w-auto"
                >
                  {FOOD_CATEGORY_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.id === "all" ? "All categories" : option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <FoodResults
              results={results}
              source={source}
              query={query}
              isFavorite={isFavorite}
              onToggleFavorite={(id) => void toggleFavorite(id)}
              onSelect={(id) => {
                setFoodId(id);
                setErrors((current) => ({ ...current, foodId: undefined }));
              }}
            />
          </>
        )}
      </div>

      {/* ---------------------------- quantity ---------------------------- */}
      {food && (
        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr]">
          <div>
            <FieldLabel htmlFor="food-log-servings" required hint={`1 serving = ${food.servingSize.quantity} ${unitLabel(food.servingSize.unit)}`}>
              Quantity (servings)
            </FieldLabel>
            <div className="flex items-stretch gap-2">
              <button
                type="button"
                onClick={() => adjustServings(-0.5)}
                aria-label="Decrease quantity by half a serving"
                className="grid w-11 shrink-0 place-items-center rounded-[10px] border border-line bg-surface text-ink transition-colors hover:border-brand-400/50 hover:text-brand-400"
              >
                <Minus className="h-4 w-4" aria-hidden="true" />
              </button>
              <input
                id="food-log-servings"
                type="number"
                inputMode="decimal"
                step="0.25"
                min={SERVINGS_MIN}
                max={SERVINGS_MAX}
                value={servingsText}
                onChange={(event) => setServingsText(event.target.value)}
                aria-invalid={errors.servings ? true : undefined}
                aria-describedby={errors.servings ? "food-log-servings-error" : undefined}
                className={cn(
                  "min-h-[42px] w-full rounded-[10px] border bg-surface px-3.5 py-2.5 text-center text-sm font-semibold text-ink transition-[border-color,box-shadow] duration-200 focus:outline-none focus:ring-4",
                  errors.servings
                    ? "border-danger-500 focus:ring-danger-500/15"
                    : "border-line hover:border-brand-400/50 focus:border-brand-500 focus:ring-brand-500/15",
                )}
              />
              <button
                type="button"
                onClick={() => adjustServings(0.5)}
                aria-label="Increase quantity by half a serving"
                className="grid w-11 shrink-0 place-items-center rounded-[10px] border border-line bg-surface text-ink transition-colors hover:border-brand-400/50 hover:text-brand-400"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <FieldError id="food-log-servings-error">{errors.servings}</FieldError>
            <div className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Quick quantities">
              {QUICK_SERVINGS.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => setServingsText(String(amount))}
                  aria-pressed={servings === amount}
                  className={cn(
                    "rounded-pill border px-3 py-1 text-xs font-semibold transition-colors",
                    servings === amount
                      ? "border-brand-600 bg-brand-700 text-white"
                      : "border-line bg-surface text-muted hover:border-brand-400/50 hover:text-brand-400",
                  )}
                >
                  {amount} {amount === 1 ? "serving" : "servings"}
                </button>
              ))}
              {food.servingSize.unit === "grams" &&
                [100, 150, 200].map((grams) => {
                  const amount = roundTo(grams / food.servingSize.quantity, 2);
                  return (
                    <button
                      key={grams}
                      type="button"
                      onClick={() => setServingsText(String(amount))}
                      aria-pressed={servings === amount}
                      className={cn(
                        "rounded-pill border px-3 py-1 text-xs font-semibold transition-colors",
                        servings === amount
                          ? "border-brand-600 bg-brand-700 text-white"
                          : "border-line bg-surface text-muted hover:border-brand-400/50 hover:text-brand-400",
                      )}
                    >
                      {grams} g
                    </button>
                  );
                })}
            </div>
          </div>

          <div className="rounded-[10px] border border-brand-400/25 bg-brand-50 p-4" aria-live="polite">
            <p className="text-xs font-bold uppercase tracking-wide text-brand-400">Nutrition preview</p>
            {preview ? (
              <>
                <p className="mt-1 text-sm font-semibold text-ink">{preview.portionLabel}</p>
                <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <PreviewStat label="Calories" value={`${preview.calories}`} unit="kcal" emphasis />
                  <PreviewStat label="Protein" value={`${preview.proteinGrams}`} unit="g" />
                  <PreviewStat label="Carbs" value={`${preview.carbohydrateGrams}`} unit="g" />
                  <PreviewStat label="Fat" value={`${preview.fatGrams}`} unit="g" />
                </dl>
                <p className="mt-2 text-[11px] text-muted">Fibre is not available for this food.</p>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted">Enter a quantity above zero to see the nutrition.</p>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

function suggestMealType(): FoodLogMealType {
  const hour = new Date().getHours();
  if (hour < 10) return "breakfast";
  if (hour < 12) return "morningSnack";
  if (hour < 15) return "lunch";
  if (hour < 18) return "eveningSnack";
  if (hour < 22) return "dinner";
  return "otherSnacks";
}

function SourceTab({
  active,
  onClick,
  icon,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-xs font-semibold transition-colors",
        active
          ? "border-brand-600 bg-brand-700 text-white"
          : "border-line bg-surface text-muted hover:border-brand-400/50 hover:text-brand-400",
      )}
    >
      {icon}
      {children}
      {count !== undefined && count > 0 && (
        <span className={cn("rounded-pill px-1.5 text-[10px]", active ? "bg-white/20" : "bg-line")}>{count}</span>
      )}
    </button>
  );
}

function FoodResults({
  results,
  source,
  query,
  isFavorite,
  onToggleFavorite,
  onSelect,
}: {
  results: FoodItemRecord[];
  source: Source;
  query: string;
  isFavorite: (id: string) => boolean;
  onToggleFavorite: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  if (results.length === 0) {
    const copy =
      source === "recent"
        ? { title: "No recent foods yet", body: "Foods you log will appear here for quick re-logging." }
        : source === "favorites"
          ? { title: "No favourite foods yet", body: "Tap the star on any food to keep it handy." }
          : query
            ? { title: "No foods match your search", body: "Try a shorter word or a different spelling." }
            : { title: "Search for a food to start logging", body: "Type a name above or pick a category." };
    return (
      <div className="mt-3 rounded-[10px] border border-dashed border-line bg-surface/60 px-4 py-8 text-center">
        <UtensilsCrossed className="mx-auto h-5 w-5 text-brand-400" aria-hidden="true" />
        <p className="mt-2 text-sm font-bold text-ink">{copy.title}</p>
        <p className="mt-1 text-xs text-muted">{copy.body}</p>
      </div>
    );
  }

  return (
    <ul
      className="mt-3 max-h-72 divide-y divide-line/70 overflow-y-auto rounded-[10px] border border-line bg-canvas"
      aria-label="Food results"
    >
      {results.map((food) => {
        const favorite = isFavorite(food.id);
        return (
          <li key={food.id} className="flex items-center gap-2 px-2 py-1">
            <button
              type="button"
              onClick={() => onSelect(food.id)}
              className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-[8px] px-2 py-2 text-left transition-colors hover:bg-brand-50 focus-visible:bg-brand-50"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-ink">{food.name}</span>
                <span className="block truncate text-xs text-muted">
                  {food.servingSize.quantity} {unitLabel(food.servingSize.unit)} · {foodCategoryLabel(food.category)}
                </span>
              </span>
              <span className="shrink-0 text-right text-xs text-muted">
                <span className="block font-bold text-ink">{food.calories} kcal</span>
                <span className="block">P {food.proteinGrams} g</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => onToggleFavorite(food.id)}
              aria-pressed={favorite}
              aria-label={favorite ? `Remove ${food.name} from favourites` : `Add ${food.name} to favourites`}
              className={cn(
                "grid h-9 w-9 shrink-0 place-items-center rounded-[8px] transition-colors",
                favorite ? "text-accent-300 hover:bg-accent-200/40" : "text-muted hover:bg-line/60 hover:text-accent-300",
              )}
            >
              <Star className={cn("h-4 w-4", favorite && "fill-current")} aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function SelectedFoodPanel({
  food,
  favorite,
  onToggleFavorite,
  onChange,
}: {
  food: FoodItemRecord;
  favorite: boolean;
  onToggleFavorite: () => void;
  onChange: () => void;
}) {
  const diets = food.dietaryTypes.map((id) => labelFor(DIETARY_TYPES, id));
  const shortestDiet =
    food.dietaryTypes.includes("vegan")
      ? "Vegan"
      : food.dietaryTypes.includes("vegetarian")
        ? "Vegetarian"
        : food.dietaryTypes.includes("eggetarian")
          ? "Eggetarian"
          : food.dietaryTypes.includes("pescatarian")
            ? "Pescatarian"
            : diets[0] ?? null;

  return (
    <div className="rounded-[10px] border border-line bg-canvas p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-brand-700 text-white">
            <UtensilsCrossed className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-brand-400">Selected food</p>
            <h3 className="text-base font-bold leading-snug text-ink">{food.name}</h3>
            <p className="mt-0.5 text-xs text-muted">
              Reference serving: {food.servingSize.quantity} {unitLabel(food.servingSize.unit)} · {food.calories} kcal · P{" "}
              {food.proteinGrams} g · C {food.carbohydrateGrams} g · F {food.fatGrams} g
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onToggleFavorite}
            aria-pressed={favorite}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-xs font-semibold transition-colors",
              favorite
                ? "border-accent-300/40 bg-accent-200/40 text-accent-300"
                : "border-line bg-surface text-muted hover:border-accent-300/40 hover:text-accent-300",
            )}
          >
            <Heart className={cn("h-3.5 w-3.5", favorite && "fill-current")} aria-hidden="true" />
            {favorite ? "Favourite" : "Favourite"}
          </button>
          <button
            type="button"
            onClick={onChange}
            className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-brand-400/50 hover:text-brand-400"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Change food
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge tone="brand">{foodCategoryLabel(food.category)}</Badge>
        {shortestDiet && <Badge>{shortestDiet}</Badge>}
        {food.tags.slice(0, 3).map((tag) => (
          <Badge key={tag}>{titleCase(tag.replace(/_/g, " "))}</Badge>
        ))}
        {food.allergens.length > 0 ? (
          food.allergens.map((allergen) => (
            <Badge key={allergen} tone="warning">
              Contains {allergenLabel(allergen)}
            </Badge>
          ))
        ) : (
          <Badge>No listed allergens</Badge>
        )}
      </div>
      {food.preparationTimeMinutes > 0 && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          About {food.preparationTimeMinutes} min to prepare
        </p>
      )}
    </div>
  );
}

function PreviewStat({ label, value, unit, emphasis }: { label: string; value: string; unit: string; emphasis?: boolean }) {
  return (
    <div className={cn("rounded-[8px] border p-2.5", emphasis ? "border-brand-400/25 bg-surface" : "border-line bg-surface")}>
      <dt className="text-[11px] font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 text-base font-extrabold tracking-tight text-ink">
        {value} <span className="text-[11px] font-medium text-muted">{unit}</span>
      </dd>
    </div>
  );
}
