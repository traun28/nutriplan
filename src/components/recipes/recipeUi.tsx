"use client";

/** Phase 4 — small shared pieces for recipe, grocery and pantry pages. */
import { Heart, Loader2 } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/core";
import { cn } from "@/lib/cn";
import type { RecipeSummary } from "@/services/recipes/recipeService";
import { DIETARY_TYPES, labelFor } from "@/data/options";
import { foodCategoryLabel } from "@/services/foodLog/foodSearch";

const categoryLabel = foodCategoryLabel;
const dietaryTypeLabel = (id: string) => labelFor(DIETARY_TYPES, id);

export function PageShell({ eyebrow, title, intro, badges, children }: { eyebrow: string; title: string; intro: string; badges?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:py-14">
      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-400">{eyebrow}</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">{intro}</p>
        {badges && <div className="mt-3 flex flex-wrap items-center gap-2">{badges}</div>}
      </header>
      {children}
    </div>
  );
}

export function Notice({ tone, message, action }: { tone: "error" | "warning" | "info"; message: ReactNode; action?: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "mb-5 flex flex-wrap items-center justify-between gap-3 rounded-card border p-4 text-sm",
        tone === "error" && "border-danger-500/30 bg-danger-50/60 text-danger-700",
        tone === "warning" && "border-accent-300/40 bg-accent-200/30 text-ink",
        tone === "info" && "border-brand-100 bg-brand-50/60 text-ink",
      )}
    >
      <div className="min-w-0">{message}</div>
      {action}
    </div>
  );
}

export function FavoriteButton({ active, onToggle, busy = false, size = "md", name }: { active: boolean; onToggle: () => void; busy?: boolean; size?: "sm" | "md"; name: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      aria-pressed={active}
      aria-label={active ? `Remove ${name} from saved recipes` : `Save ${name}`}
      title={active ? "Saved" : "Save recipe"}
      disabled={busy}
      className={cn(
        "grid shrink-0 place-items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:opacity-60",
        size === "sm" ? "h-8 w-8" : "h-10 w-10",
        active ? "border-danger-500/30 bg-danger-50 text-danger-600" : "border-line bg-surface text-muted hover:text-danger-600",
      )}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Heart className={cn("h-4 w-4", active && "fill-current")} aria-hidden="true" />}
    </button>
  );
}

export function RecipeCard({ recipe, favorite, onToggleFavorite, footer }: { recipe: RecipeSummary; favorite: boolean; onToggleFavorite?: () => void; footer?: ReactNode }) {
  return (
    <article className="card-hover flex h-full flex-col rounded-card border border-line bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-brand-400">{categoryLabel(recipe.category)}</p>
          <h3 className="mt-0.5 text-base font-bold leading-snug text-ink">
            <Link href={`/recipes/${recipe.id}`} className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 hover:text-brand-600">
              {recipe.name}
            </Link>
          </h3>
        </div>
        {onToggleFavorite && <FavoriteButton size="sm" active={favorite} onToggle={onToggleFavorite} name={recipe.name} />}
      </div>
      <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted">
        {recipe.description ?? `Ingredients: ${recipe.ingredientNames.slice(0, 5).join(", ")}${recipe.ingredientNames.length > 5 ? "…" : ""}`}
      </p>
      <dl className="mt-3 grid grid-cols-4 gap-2 rounded-lg bg-canvas px-3 py-2 text-center">
        <Macro label="kcal" value={recipe.calories} />
        <Macro label="protein" value={`${recipe.proteinGrams}g`} />
        <Macro label="carbs" value={`${recipe.carbohydrateGrams}g`} />
        <Macro label="fat" value={`${recipe.fatGrams}g`} />
      </dl>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
        <Badge>{recipe.totalMinutes !== null ? `${recipe.totalMinutes} min total` : `${recipe.prepMinutes} min prep`}</Badge>
        <Badge>{recipe.difficulty}</Badge>
        {recipe.dietaryTypes.slice(0, 2).map((d) => (
          <Badge key={d} tone="brand">
            {dietaryTypeLabel(d)}
          </Badge>
        ))}
      </div>
      {footer && <div className="mt-auto pt-3">{footer}</div>}
    </article>
  );
}

function Macro({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="text-sm font-bold text-ink">{value}</dd>
    </div>
  );
}

export function NotAvailable({ children = "Information not available" }: { children?: ReactNode }) {
  return <span className="text-sm italic text-muted">{children}</span>;
}
