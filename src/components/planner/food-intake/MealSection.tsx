"use client";

/**
 * MealSection — one reusable card per meal slot.
 *
 * Used identically by Breakfast, Morning Snack, Lunch, Evening Snack,
 * Dinner and Other Snacks, so there is a single markup/behaviour source.
 *
 * `hasMeal: false` is an explicit "I usually skip this meal" statement.
 * Items are preserved while the meal is skipped so nothing is lost if the
 * user changes their mind — they simply stop being required.
 */
import { Plus, UtensilsCrossed } from "lucide-react";
import { useState } from "react";
import type { MealEntry } from "@/types/profile";
import type { MealDefinition } from "@/data/options";
import type { FoodIntakeIssue } from "@/lib/validation";
import { FoodItemRow } from "@/components/planner/food-intake/FoodItemRow";
import { Badge } from "@/components/ui/core";
import { cn } from "@/lib/cn";

interface MealSectionProps {
  definition: MealDefinition;
  meal: MealEntry;
  issues: FoodIntakeIssue[];
  onToggleSkip: (skipped: boolean) => void;
  onAddItem: () => string;
  onUpdateItem: (
    itemId: string,
    patch: Partial<{ name: string; quantity: number | null; unit: string; notes: string }>,
  ) => void;
  onRemoveItem: (itemId: string) => void;
  onNotesChange: (notes: string) => void;
}

export function MealSection({
  definition,
  meal,
  issues,
  onToggleSkip,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
  onNotesChange,
}: MealSectionProps) {
  const [focusItemId, setFocusItemId] = useState<string | null>(null);

  const skipId = `skip-${definition.id}`;
  const notesId = `notes-${definition.id}`;
  const filledItems = meal.items.filter((item) => item.name.trim()).length;

  const errorFor = (
    itemId: string,
    field: FoodIntakeIssue["field"],
  ): string | undefined =>
    issues.find((issue) => issue.itemId === itemId && issue.field === field)
      ?.message;

  const handleAdd = () => {
    const newId = onAddItem();
    setFocusItemId(newId);
  };

  return (
    <section
      aria-labelledby={`meal-heading-${definition.id}`}
      className={cn(
        "rounded-card border bg-white p-4 transition-colors duration-200 sm:p-5",
        meal.hasMeal ? "border-line" : "border-dashed border-line bg-canvas/60",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden="true"
            className={cn(
              "grid h-9 w-9 shrink-0 place-items-center rounded-[10px]",
              meal.hasMeal
                ? "bg-brand-50 text-brand-700"
                : "bg-line/60 text-muted",
            )}
          >
            <UtensilsCrossed className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3
              id={`meal-heading-${definition.id}`}
              className="text-sm font-bold text-ink"
            >
              {definition.label}
            </h3>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              {definition.description}
            </p>
          </div>
        </div>

        {meal.hasMeal && filledItems > 0 && (
          <Badge tone="brand">
            {filledItems} {filledItems === 1 ? "item" : "items"}
          </Badge>
        )}
      </div>

      {/* Skip toggle */}
      <div className="mt-3">
        <label
          htmlFor={skipId}
          className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-muted"
        >
          <input
            id={skipId}
            type="checkbox"
            checked={!meal.hasMeal}
            onChange={(event) => onToggleSkip(event.target.checked)}
            className="h-4 w-4 accent-[var(--color-brand-600)]"
          />
          I usually skip this meal
        </label>
      </div>

      {meal.hasMeal ? (
        <>
          {meal.items.length === 0 ? (
            <div className="mt-3 rounded-[10px] border border-dashed border-line bg-canvas px-4 py-5 text-center">
              <p className="text-sm font-semibold text-ink">No food added yet</p>
              <p className="mt-0.5 text-xs text-muted">
                Add the items you usually have for {definition.label.toLowerCase()}.
              </p>
            </div>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {meal.items.map((item, index) => (
                <FoodItemRow
                  key={item.id}
                  mealLabel={definition.label}
                  index={index}
                  item={item}
                  autoFocus={item.id === focusItemId}
                  nameError={errorFor(item.id, "name")}
                  quantityError={errorFor(item.id, "quantity")}
                  onChange={(patch) => onUpdateItem(item.id, patch)}
                  onRemove={() => onRemoveItem(item.id)}
                />
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={handleAdd}
            className="mt-3 inline-flex items-center gap-1.5 rounded-pill border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-brand-500"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add Food
            <span className="sr-only"> to {definition.label}</span>
          </button>

          <div className="mt-3">
            <label
              htmlFor={notesId}
              className="mb-1.5 block text-xs font-semibold text-ink"
            >
              {definition.label} notes{" "}
              <span className="font-normal text-muted">(optional)</span>
            </label>
            <input
              id={notesId}
              type="text"
              value={meal.notes}
              onChange={(event) => onNotesChange(event.target.value)}
              maxLength={160}
              placeholder="Example: usually eaten at college"
              className="w-full rounded-[10px] border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted/70 transition-[border-color,box-shadow] hover:border-brand-300 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15"
            />
          </div>
        </>
      ) : (
        <p className="mt-3 rounded-[10px] bg-white px-4 py-3 text-xs leading-relaxed text-muted">
          Marked as skipped. This meal will not be planned for you, and no food
          entries are required here.
        </p>
      )}
    </section>
  );
}
