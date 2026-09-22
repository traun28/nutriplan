"use client";

/**
 * Consumed-vs-target bar in the existing "Target vs Planned" style.
 * The fill never exceeds 100% visually; going over the target is shown
 * with a distinct tone and an explicit "over" label, plus a text equivalent.
 */
import { cn } from "@/lib/cn";

export function ProgressBar({
  value,
  target,
  label,
  unit,
  barClass = "bg-brand-700",
  className,
  size = "md",
}: {
  value: number;
  target: number | null;
  label: string;
  unit: string;
  barClass?: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const percent = target && target > 0 ? Math.round((value / target) * 100) : null;
  const over = percent !== null && percent > 100;
  const width = percent === null ? 0 : Math.min(100, percent);

  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-pill bg-line",
        size === "sm" ? "h-1.5" : "h-2.5",
        className,
      )}
      role="img"
      aria-label={
        target === null
          ? `${label}: ${value.toLocaleString()} ${unit} logged; no target available.`
          : `${label}: ${value.toLocaleString()} of ${target.toLocaleString()} ${unit}, ${percent}% of target${over ? " — target exceeded" : ""}.`
      }
    >
      <div
        className={cn(
          "h-full rounded-pill transition-[width] duration-700 ease-out",
          over ? "bg-accent-400" : barClass,
        )}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
