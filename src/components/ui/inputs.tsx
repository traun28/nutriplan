"use client";

/**
 * Form input primitives: TextField · NumberField · SelectField · TextAreaField
 *
 * All of them:
 *  - render a proper <label> (never placeholder-only)
 *  - accept `error` + `hint` and wire aria-describedby / aria-invalid
 *  - share the same focus, hover and error visuals
 *
 * NumberField stores `number | null` in the profile (never "65 kg"
 * strings) while keeping a forgiving local text state while typing.
 */
import { ChevronDown } from "lucide-react";
import {
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/cn";
import { FieldError, FieldLabel } from "@/components/ui/core";

const CONTROL_BASE =
  "w-full rounded-[10px] border bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/70 transition-[border-color,box-shadow,background-color] duration-200 focus:outline-none focus:ring-4";
const CONTROL_NORMAL = "border-line hover:border-brand-400/50 focus:border-brand-500 focus:ring-brand-500/15";
const CONTROL_ERROR =
  "border-danger-500 bg-danger-50/60 hover:border-danger-500 focus:border-danger-500 focus:ring-danger-500/15";

function fieldClasses(error?: string) {
  return cn(CONTROL_BASE, error ? CONTROL_ERROR : CONTROL_NORMAL);
}

function useAria(errorId: string | undefined, error?: string) {
  return {
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? errorId : undefined,
  } as const;
}

/* ------------------------------------------------------------------ */
/* TextField                                                           */
/* ------------------------------------------------------------------ */

interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  required?: boolean;
  icon?: ReactNode;
}

export function TextField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  required,
  icon,
  className,
  ...rest
}: TextFieldProps) {
  const reactId = useId();
  const inputId = id ?? `field-${reactId}`;
  const errorId = `${inputId}-error`;

  return (
    <div className={className}>
      <FieldLabel htmlFor={inputId} required={required} hint={hint}>
        {label}
      </FieldLabel>
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
            {icon}
          </span>
        )}
        <input
          id={inputId}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cn(fieldClasses(error), icon ? "pl-10" : undefined)}
          {...useAria(errorId, error)}
          {...rest}
        />
      </div>
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* NumberField — stores number | null, shows a unit suffix             */
/* ------------------------------------------------------------------ */

interface NumberFieldProps {
  id?: string;
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  onBlur?: () => void;
  unit?: string;
  placeholder?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  /** Minimum allowed value (native hint only — real validation lives in lib/validation). */
  min?: number;
  max?: number;
}

export function NumberField({
  id,
  label,
  value,
  onChange,
  onBlur,
  unit,
  placeholder,
  error,
  hint,
  required,
  min,
  max,
}: NumberFieldProps) {
  const reactId = useId();
  const inputId = id ?? `field-${reactId}`;
  const errorId = `${inputId}-error`;

  const [text, setText] = useState(value === null ? "" : String(value));
  const [syncedValue, setSyncedValue] = useState(value);
  const [focused, setFocused] = useState(false);

  // Re-sync from the profile when we are not actively typing (e.g. a reset
  // or an edit made elsewhere). Adjusting state during render is React's
  // recommended alternative to a synchronising effect.
  if (!focused && value !== syncedValue) {
    setSyncedValue(value);
    setText(value === null ? "" : String(value));
  }

  const handleChange = (raw: string) => {
    setText(raw);
    if (raw.trim() === "") {
      onChange(null);
      return;
    }
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      onChange(parsed);
    }
  };

  const handleBlur = () => {
    setFocused(false);
    const trimmed = text.trim();
    if (trimmed === "") {
      setText("");
      onChange(null);
    } else {
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) {
        setText(String(parsed));
        onChange(parsed);
      } else {
        setText("");
        onChange(null);
      }
    }
    onBlur?.();
  };

  return (
    <div>
      <FieldLabel htmlFor={inputId} required={required} hint={hint}>
        {label}
      </FieldLabel>
      <div className="relative">
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder={placeholder}
          value={text}
          min={min}
          max={max}
          onChange={(event) => handleChange(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={handleBlur}
          className={cn(fieldClasses(error), unit && "pr-14")}
          {...useAria(errorId, error)}
        />
        {unit && (
          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold uppercase tracking-wide text-muted">
            {unit}
          </span>
        )}
      </div>
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SelectField                                                         */
/* ------------------------------------------------------------------ */

interface SelectFieldProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "value"> {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  error?: string;
  hint?: string;
  required?: boolean;
}

export function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  placeholder = "Select…",
  error,
  hint,
  required,
  ...rest
}: SelectFieldProps) {
  const reactId = useId();
  const selectId = id ?? `field-${reactId}`;
  const errorId = `${selectId}-error`;

  return (
    <div>
      <FieldLabel htmlFor={selectId} required={required} hint={hint}>
        {label}
      </FieldLabel>
      <div className="relative">
        <select
          id={selectId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            fieldClasses(error),
            "appearance-none pr-10",
            value === "" && "text-muted",
          )}
          {...useAria(errorId, error)}
          {...rest}
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
      </div>
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* TextAreaField                                                       */
/* ------------------------------------------------------------------ */

interface TextAreaFieldProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  required?: boolean;
}

/* ------------------------------------------------------------------ */
/* TimeField — 24-hour "HH:MM" values, always optional                 */
/* ------------------------------------------------------------------ */

export function TimeField({
  id,
  label,
  value,
  onChange,
  hint,
  error,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
}) {
  const reactId = useId();
  const inputId = id ?? `field-${reactId}`;
  const errorId = `${inputId}-error`;

  return (
    <div>
      <FieldLabel htmlFor={inputId} hint={hint}>
        {label}
      </FieldLabel>
      <input
        id={inputId}
        type="time"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(fieldClasses(error), "min-h-[42px]")}
        {...useAria(errorId, error)}
      />
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}

export function TextAreaField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  required,
  className,
  rows = 3,
  ...rest
}: TextAreaFieldProps) {
  const reactId = useId();
  const areaId = id ?? `field-${reactId}`;
  const errorId = `${areaId}-error`;

  return (
    <div className={className}>
      <FieldLabel htmlFor={areaId} required={required} hint={hint}>
        {label}
      </FieldLabel>
      <textarea
        id={areaId}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(fieldClasses(error), "resize-y")}
        {...useAria(errorId, error)}
        {...rest}
      />
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}
