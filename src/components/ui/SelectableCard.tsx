"use client";

/**
 * SelectableCard — accessible radio/checkbox card.
 *
 * Built on a real (visually hidden) input so keyboard navigation, focus
 * rings and screen readers all work natively. Used for activity levels,
 * goals, dietary patterns and allergen selections.
 */
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface SelectableCardProps {
  name: string;
  value: string;
  selected: boolean;
  onSelect: (selected: boolean) => void;
  title: string;
  description?: string;
  icon?: ReactNode;
  mode?: "radio" | "checkbox";
  disabled?: boolean;
  /** Optional id for the underlying input — used to focus invalid groups. */
  inputId?: string;
}

export function SelectableCard({
  name,
  value,
  selected,
  onSelect,
  title,
  description,
  icon,
  mode = "radio",
  disabled = false,
  inputId,
}: SelectableCardProps) {
  return (
    <label
      className={cn(
        "group relative block h-full rounded-card border bg-white p-4 transition-all duration-200",
        selected
          ? "border-brand-500 bg-brand-50/70 shadow-card ring-1 ring-brand-500/40"
          : "border-line hover:border-brand-300 hover:shadow-card",
        disabled
          ? "cursor-not-allowed opacity-50"
          : "cursor-pointer focus-within:border-brand-500",
      )}
    >
      <input
        id={inputId}
        type={mode === "radio" ? "radio" : "checkbox"}
        name={name}
        value={value}
        checked={selected}
        disabled={disabled}
        onChange={(event) => onSelect(event.target.checked)}
        className="peer sr-only"
      />

      <div className="flex items-start gap-3.5">
        {icon && (
          <span
            aria-hidden="true"
            className={cn(
              "grid h-10 w-10 shrink-0 place-items-center rounded-[10px] transition-colors duration-200",
              selected
                ? "bg-brand-600 text-white"
                : "bg-brand-50 text-brand-700 group-hover:bg-brand-100",
            )}
          >
            {icon}
          </span>
        )}

        <span className="min-w-0 flex-1">
          <span className="block pr-7 text-sm font-bold text-ink">{title}</span>
          {description && (
            <span className="mt-1 block text-xs leading-relaxed text-muted">
              {description}
            </span>
          )}
        </span>
      </div>

      {/* Selection indicator — visible beyond colour alone (icon + ring). */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full transition-all duration-200",
          selected
            ? "scale-100 bg-brand-600 text-white opacity-100"
            : "scale-90 border border-line bg-white text-transparent opacity-60 group-hover:border-brand-300",
        )}
      >
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>

      <span className="pointer-events-none absolute inset-0 rounded-card ring-0 ring-brand-500/25 transition-shadow duration-200 peer-focus-visible:ring-4" />
    </label>
  );
}
