"use client";

/**
 * Phase 5 — small, dependency-free SVG charts in the NutriPlan palette.
 * Missing values are rendered as gaps (never interpolated), every chart has
 * a visually-hidden table alternative, and values are labelled so colour
 * is never the only carrier of information.
 */
import { useId } from "react";
import { cn } from "@/lib/cn";

export interface ChartPoint {
  label: string;
  value: number | null;
}

function fmt(v: number, unit: string): string {
  const n = Number.isInteger(v) ? String(v) : v.toFixed(1);
  return unit ? `${n} ${unit}` : n;
}

export function DataTable({ title, points, unit, className }: { title: string; points: ChartPoint[]; unit: string; className?: string }) {
  return (
    <table className={cn("sr-only", className)}>
      <caption>{title}</caption>
      <thead>
        <tr>
          <th scope="col">Day</th>
          <th scope="col">Value</th>
        </tr>
      </thead>
      <tbody>
        {points.map((p) => (
          <tr key={p.label}>
            <th scope="row">{p.label}</th>
            <td>{p.value === null ? "No data" : fmt(p.value, unit)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Vertical bars with an optional target line; null → empty slot with a dash. */
export function BarChart({ title, points, unit, target, barClass = "fill-brand-500", height = 150 }: { title: string; points: ChartPoint[]; unit: string; target?: number | null; barClass?: string; height?: number }) {
  const id = useId();
  const values = points.map((p) => p.value).filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  const max = Math.max(...values, target ?? 0) * 1.12 || 1;
  const w = 100 / points.length;
  const pad = 22;
  const y = (v: number) => height - pad - (v / max) * (height - pad - 8);
  return (
    <figure aria-labelledby={`${id}-t`} className="w-full">
      <figcaption id={`${id}-t`} className="sr-only">
        {title}
      </figcaption>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="h-40 w-full overflow-visible" role="img" aria-hidden="true">
        {target !== null && target !== undefined && target > 0 && (
          <g>
            <line x1={0} x2={100} y1={y(target)} y2={y(target)} className="stroke-accent-400" strokeWidth={0.6} strokeDasharray="2 1.5" vectorEffect="non-scaling-stroke" />
          </g>
        )}
        {points.map((p, i) => {
          const x = i * w + w * 0.2;
          const bw = w * 0.6;
          if (p.value === null) {
            return <rect key={p.label} x={x} y={height - pad - 1.5} width={bw} height={1.5} className="fill-line" rx={0.5} />;
          }
          const top = y(p.value);
          return (
            <g key={p.label}>
              <rect x={x} y={top} width={bw} height={height - pad - top} rx={1} className={cn(barClass, "np-bar")} style={{ transformOrigin: `${x + bw / 2}px ${height - pad}px` }} />
            </g>
          );
        })}
      </svg>
      <div className="mt-1 grid text-center text-[11px] text-muted" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }} aria-hidden="true">
        {points.map((p) => (
          <div key={p.label} className="min-w-0">
            <div className="truncate font-semibold text-ink">{p.value === null ? "—" : Number.isInteger(p.value) ? p.value : p.value.toFixed(1)}</div>
            <div className="truncate">{p.label}</div>
          </div>
        ))}
      </div>
      {target ? <p className="mt-1 text-[11px] text-muted" aria-hidden="true">Dashed line: target {fmt(target, unit)}</p> : null}
      <DataTable title={title} points={points} unit={unit} />
    </figure>
  );
}

/** Line with dots; segments are broken wherever a value is missing. */
export function LineChart({ title, points, unit, height = 150, lineClass = "stroke-brand-600", dotClass = "fill-brand-600", target }: { title: string; points: ChartPoint[]; unit: string; height?: number; lineClass?: string; dotClass?: string; target?: number | null }) {
  const id = useId();
  const values = points.map((p) => p.value).filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  const lo = Math.min(...values, target ?? Infinity);
  const hi = Math.max(...values, target ?? -Infinity);
  const span = hi - lo || 1;
  const padY = 12;
  const padB = 22;
  const y = (v: number) => height - padB - ((v - lo) / span) * (height - padB - padY);
  const w = 100 / points.length;
  const x = (i: number) => i * w + w / 2;
  const segments: string[] = [];
  let current: string[] = [];
  points.forEach((p, i) => {
    if (p.value === null) {
      if (current.length) segments.push(current.join(" "));
      current = [];
    } else current.push(`${x(i)},${y(p.value)}`);
  });
  if (current.length) segments.push(current.join(" "));
  return (
    <figure aria-labelledby={`${id}-t`} className="w-full">
      <figcaption id={`${id}-t`} className="sr-only">
        {title}
      </figcaption>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="h-40 w-full overflow-visible" role="img" aria-hidden="true">
        {target !== null && target !== undefined && Number.isFinite(target) && (
          <line x1={0} x2={100} y1={y(target)} y2={y(target)} className="stroke-accent-400" strokeWidth={0.6} strokeDasharray="2 1.5" vectorEffect="non-scaling-stroke" />
        )}
        {segments.map((seg, i) => (
          <polyline key={i} points={seg} fill="none" className={cn(lineClass, "np-line")} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        ))}
        {points.map((p, i) => p.value !== null && <circle key={p.label} cx={x(i)} cy={y(p.value)} r={1.6} className={dotClass} vectorEffect="non-scaling-stroke" />)}
      </svg>
      <div className="mt-1 grid text-center text-[11px] text-muted" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }} aria-hidden="true">
        {points.map((p) => (
          <div key={p.label} className="min-w-0">
            <div className="truncate font-semibold text-ink">{p.value === null ? "—" : Number.isInteger(p.value) ? p.value : p.value.toFixed(1)}</div>
            <div className="truncate">{p.label}</div>
          </div>
        ))}
      </div>
      <DataTable title={title} points={points} unit={unit} />
    </figure>
  );
}

/** Horizontal share bars (contribution lists). */
export function ShareBars({ rows, unit }: { rows: { label: string; sublabel?: string; amount: number; share: number }[]; unit: string }) {
  return (
    <ol className="space-y-2">
      {rows.map((r, i) => (
        <li key={`${r.label}-${i}`} className="text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-ink">
              <span className="mr-1.5 text-xs font-bold text-muted">{i + 1}.</span>
              {r.label}
              {r.sublabel && <span className="ml-1 text-xs text-muted">· {r.sublabel}</span>}
            </span>
            <span className="shrink-0 tabular-nums text-muted">
              {fmt(r.amount, unit)} <span className="text-xs">({Math.round(r.share * 100)}%)</span>
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-pill bg-line" role="img" aria-label={`${r.label}: ${Math.round(r.share * 100)} percent`}>
            <div className="np-grow h-full rounded-pill bg-brand-500" style={{ width: `${Math.max(2, Math.round(r.share * 100))}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Circular score ring. */
export function ScoreRing({ value, label }: { value: number; label: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(100, value)) / 100);
  return (
    <div className="relative grid h-20 w-20 place-items-center" role="img" aria-label={`${label}: ${value} out of 100`}>
      <svg viewBox="0 0 64 64" className="h-20 w-20 -rotate-90">
        <circle cx={32} cy={32} r={r} className="fill-none stroke-line" strokeWidth={6} />
        <circle cx={32} cy={32} r={r} className="np-ring fill-none stroke-brand-600" strokeWidth={6} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} />
      </svg>
      <span className="absolute text-xl font-bold tabular-nums text-ink">{value}</span>
    </div>
  );
}
