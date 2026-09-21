"use client";

/**
 * One structured food entry inside a meal.
 *
 * Stores `name`, `quantity` (number) and `unit` (machine-readable id)
 * separately — never a single "3 idlis" string — so Part 7 can match and
 * scale portions later.
 *
 * Reused by every meal slot; there is only one implementation.
 */
import { Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import type { FoodItem } from "@/types/profile";
import { FOOD_UNITS, SUGGESTED_FOODS } from "@/data/options";
import { FieldError } from "@/components/ui/core";
import { cn } from "@/lib/cn";

const CONTROL =
  "w-full rounded-[10px] border bg-white px-3 py-2 text-sm text-ink placeholder:text-muted/70 transition-[border-color,box-shadow] duration-200 focus:outline-none focus:ring-4";
const NORMAL =
  "border-line hover:border-brand-300 focus:border-brand-500 focus:ring-brand-500/15";
const INVALID =
  "border-danger-500 bg-danger-50/40 focus:border-danger-500 focus:ring-danger-500/15";

interface FoodItemRowProps {
  mealLabel: string;
  index: number;
  item: FoodItem;
  autoFocus?: boolean;
  nameError?: string;
  quantityError?: string;
  onChange: (patch: Partial<Omit<FoodItem, "id">>) => void;
  onRemove: () => void;
}

export function FoodItemRow({
  mealLabel,
  index,
  item,
  autoFocus = false,
  nameError,
  quantityError,
  onChange,
  onRemove,
}: FoodItemRowProps) {
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) nameRef.current?.focus();
  }, [autoFocus]);

  const rowLabel = `${mealLabel} item ${index + 1}`;
  const nameId = `${item.id}-name`;
  const quantityId = `${item.id}-quantity`;
  const unitId = `${item.id}-unit`;
  const notesId = `${item.id}-notes`;

  const handleQuantity = (raw: string) => {
    if (raw.trim() === "") {
      onChange({ quantity: null });
      return;
    }
    const parsed = Number(raw);
    onChange({ quantity: Number.isFinite(parsed) ? parsed : null });
  };

  return (
    <li className="rounded-[10px] border border-line bg-canvas p-3">
      <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_5.5rem_9rem_auto] sm:items-start">
        {/* Food name */}
        <div className="min-w-0">
          <label htmlFor={nameId} className="sr-only">
            {rowLabel} — food name
          </label>
          <input
            ref={nameRef}
            id={nameId}
            type="text"
            list="pdp-food-suggestions"
            autoComplete="off"
            placeholder="Enter food name"
            value={item.name}
            onChange={(event) => onChange({ name: event.target.value })}
            className={cn(CONTROL, nameError ? INVALID : NORMAL)}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? `${nameId}-error` : undefined}
          />
        </div>

        {/* Quantity */}
        <div>
          <label htmlFor={quantityId} className="sr-only">
            {rowLabel} — quantity
          </label>
          <input
            id={quantityId}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="Qty"
            value={item.quantity === null ? "" : String(item.quantity)}
            onChange={(event) => handleQuantity(event.target.value)}
            className={cn(CONTROL, quantityError ? INVALID : NORMAL)}
            aria-invalid={quantityError ? true : undefined}
            aria-describedby={quantityError ? `${quantityId}-error` : undefined}
          />
        </div>

        {/* Unit */}
        <div>
          <label htmlFor={unitId} className="sr-only">
            {rowLabel} — unit
          </label>
          <select
            id={unitId}
            value={item.unit}
            onChange={(event) => onChange({ unit: event.target.value })}
            className={cn(CONTROL, NORMAL, item.unit === "" && "text-muted")}
          >
            <option value="">Unit</option>
            {FOOD_UNITS.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.label}
              </option>
            ))}
          </select>
        </div>

        {/* Remove */}
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${rowLabel}`}
          className="inline-flex h-[38px] items-center justify-center gap-1.5 rounded-[10px] border border-line bg-white px-3 text-xs font-semibold text-muted transition-colors hover:border-danger-500 hover:bg-danger-50 hover:text-danger-600 focus-visible:outline-2 focus-visible:outline-danger-500 sm:w-[38px] sm:px-0"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          <span className="sm:hidden">Remove</span>
        </button>
      </div>

      {/* Optional per-item note (also covers custom units like "1 ladle") */}
      <div className="mt-2.5">
        <label htmlFor={notesId} className="sr-only">
          {rowLabel} — note
        </label>
        <input
          id={notesId}
          type="text"
          autoComplete="off"
          placeholder="Optional note, e.g. “1 small bowl” or “without sugar”"
          value={item.notes}
          onChange={(event) => onChange({ notes: event.target.value })}
          maxLength={120}
          className={cn(CONTROL, NORMAL, "text-xs")}
        />
      </div>

      <FieldError id={`${nameId}-error`}>{nameError}</FieldError>
      <FieldError id={`${quantityId}-error`}>{quantityError}</FieldError>
    </li>
  );
}

/** Shared suggestion list, rendered once per page by FoodIntakeStep. */
export function FoodSuggestions() {
  return (
    <datalist id="pdp-food-suggestions">
      {SUGGESTED_FOODS.map((food) => (
        <option key={food} value={food} />
      ))}
    </datalist>
  );
}
