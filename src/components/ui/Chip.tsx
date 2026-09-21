"use client";

/**
 * Chip + ChipInput — tag input used for "foods to avoid" and "preferred foods".
 *
 * Values are stored normalised (lowercase, trimmed); the UI displays them
 * in Title Case. Duplicates are silently prevented.
 */
import { Plus, X } from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { addUnique, normalizeFood, titleCase } from "@/lib/normalize";
import { FieldError, FieldLabel } from "@/components/ui/core";

/* ------------------------------------------------------------------ */
/* Chip                                                                */
/* ------------------------------------------------------------------ */

export function Chip({
  label,
  onRemove,
  removeLabel,
}: {
  label: string;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-pill border border-line bg-surface py-1.5 pl-3 pr-1.5 text-sm font-medium text-ink shadow-sm">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        className="grid h-6 w-6 place-items-center rounded-full text-muted transition-colors duration-150 hover:bg-danger-50 hover:text-danger-600 focus-visible:outline-2 focus-visible:outline-danger-500"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* ChipInput                                                           */
/* ------------------------------------------------------------------ */

interface ChipInputProps {
  id?: string;
  label?: string;
  hint?: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  /** Lowercase suggestion list (rendered through a <datalist>). */
  suggestions?: string[];
  maxItems?: number;
  error?: string;
}

export function ChipInput({
  id,
  label,
  hint,
  values,
  onChange,
  placeholder = "Type a food and press Enter",
  suggestions = [],
  maxItems = 12,
  error,
}: ChipInputProps) {
  const reactId = useId();
  const listId = `chip-list-${id ?? reactId}`;
  const inputId = id ?? `chip-input-${reactId}`;
  const errorId = `${inputId}-error`;

  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const addDraft = () => {
    const food = normalizeFood(draft);
    if (!food) return;
    if (values.includes(food)) {
      setNotice(`“${titleCase(food)}” is already in the list.`);
      return;
    }
    if (values.length >= maxItems) {
      setNotice(`You can add up to ${maxItems} items.`);
      return;
    }
    onChange(addUnique(values, food));
    setDraft("");
    setNotice(null);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addDraft();
    } else if (event.key === "Backspace" && draft === "" && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div>
      {label && (
        <FieldLabel htmlFor={inputId} hint={hint}>
          {label}
        </FieldLabel>
      )}

      <div
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-[10px] border bg-surface p-2.5 transition-[border-color,box-shadow] duration-200 focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/15",
          error ? "border-danger-500 bg-danger-50/60" : "border-line",
        )}
      >
        {values.map((value) => (
          <Chip
            key={value}
            label={titleCase(value)}
            onRemove={() => onChange(values.filter((v) => v !== value))}
            removeLabel={`Remove ${titleCase(value)}`}
          />
        ))}
        <input
          id={inputId}
          type="text"
          list={listId}
          value={draft}
          placeholder={values.length === 0 ? placeholder : "Add another…"}
          onChange={(event) => {
            setDraft(event.target.value);
            if (notice) setNotice(null);
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (notice) setNotice(null);
          }}
          className="min-w-[10rem] flex-1 border-none bg-transparent px-2 py-1.5 text-sm text-ink placeholder:text-muted/70 focus:outline-none focus:ring-0"
          aria-describedby={error ? errorId : undefined}
        />
        <button
          type="button"
          onClick={addDraft}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-pill border border-brand-400/25 bg-brand-50 px-3.5 py-1.5 text-sm font-semibold text-brand-400 transition-colors duration-150 hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add
        </button>
      </div>

      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
      )}

      {notice && <p className="mt-1.5 text-xs font-medium text-accent-300">{notice}</p>}
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}
