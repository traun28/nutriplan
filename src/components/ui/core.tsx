"use client";

/**
 * Core UI primitives shared by every page.
 * Button · Card · Badge · SectionHeader · EmptyState · FieldLabel · FieldError
 */
import Link from "next/link";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-700 text-white shadow-[0_6px_16px_rgba(5,150,105,0.28)] hover:bg-brand-800 hover:shadow-[0_8px_20px_rgba(5,150,105,0.35)] active:translate-y-px",
  secondary:
    "border border-brand-400/25 bg-brand-50 text-brand-300 hover:bg-brand-100",
  outline:
    "border border-line bg-surface text-ink hover:border-brand-400/50 hover:bg-brand-50 hover:text-brand-400",
  ghost: "text-muted hover:bg-brand-50 hover:text-brand-400",
  danger:
    "bg-danger-800 text-white shadow-[0_6px_16px_rgba(239,68,68,0.28)] hover:bg-danger-600 active:translate-y-px",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "px-4 py-2 text-sm",
  md: "px-5 py-2.5 text-sm",
  lg: "px-7 py-3.5 text-base",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  /** When provided, renders as a next/link anchor instead of a button. */
  href?: string;
  /** React 19 passes refs as ordinary props. */
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  href,
  className,
  children,
  disabled,
  ref,
  ...rest
}: ButtonProps) {
  const classes = cn(
    "inline-flex select-none items-center justify-center gap-2 rounded-pill font-semibold transition-all duration-200",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
    "disabled:pointer-events-none disabled:opacity-50",
    BUTTON_VARIANTS[variant],
    BUTTON_SIZES[size],
    className,
  );

  if (href && !disabled) {
    return (
      <Link href={href} className={classes}>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          icon
        )}
        {children}
      </Link>
    );
  }

  return (
    <button
      ref={ref}
      type="button"
      className={classes}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-card border border-line bg-surface shadow-card",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardBody({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  // `card-pad` is the shared padding token (16px, 20px from sm) — tighter
  // than the old p-5 sm:p-7 so more content fits on screen. Still overridable
  // per call site because utilities layer after components.
  return <div className={cn("card-pad", className)}>{children}</div>;
}

/* ------------------------------------------------------------------ */
/* Badge                                                               */
/* ------------------------------------------------------------------ */

type BadgeTone = "neutral" | "brand" | "warning" | "danger" | "solid";

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "border border-line bg-surface text-muted",
  brand: "border border-brand-400/25 bg-brand-50 text-brand-400",
  warning: "border border-accent-300/40/30 bg-accent-200/40 text-accent-300",
  danger: "border border-danger-500/30 bg-danger-50 text-danger-700",
  solid: "border border-brand-600 bg-brand-700 text-white",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-xs font-semibold",
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* SectionHeader                                                       */
/* ------------------------------------------------------------------ */

export function SectionHeader({
  eyebrow,
  title,
  description,
  align = "left",
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div
      className={cn(
        align === "center" && "text-center",
        "max-w-2xl",
        className,
      )}
    >
      {eyebrow && (
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-400">
          {eyebrow}
        </p>
      )}
      <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
        {title}
      </h2>
      {description && (
        <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">
          {description}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* EmptyState                                                          */
/* ------------------------------------------------------------------ */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-card border border-dashed border-line bg-surface/60 px-5 py-6 text-center sm:py-7",
        className,
      )}
    >
      {icon && (
        <div className="grid h-10 w-10 place-items-center rounded-full bg-brand-50 text-brand-400">
          {icon}
        </div>
      )}
      <h3 className="mt-3 text-base font-bold text-ink">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Form field label + error                                            */
/* ------------------------------------------------------------------ */

export function FieldLabel({
  htmlFor,
  children,
  required,
  hint,
}: {
  htmlFor?: string;
  children: ReactNode;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-3">
      <label
        htmlFor={htmlFor}
        className="text-sm font-semibold text-ink"
      >
        {children}
        {required && (
          <span className="ml-0.5 text-danger-500" aria-hidden="true">
            *
          </span>
        )}
        {required && <span className="sr-only"> (required)</span>}
      </label>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

export function FieldError({
  id,
  children,
}: {
  id?: string;
  children?: string;
}) {
  if (!children) return null;
  return (
    <p
      id={id}
      role="alert"
      className="mt-1.5 flex items-start gap-1.5 text-xs font-medium leading-relaxed text-danger-600"
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
