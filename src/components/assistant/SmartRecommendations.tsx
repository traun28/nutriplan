"use client";

/**
 * Phase 6 — a small "Smart suggestions" card for the dashboard aside.
 * Shows at most four data-backed recommendations, each with its reason.
 * Items either deep-link to an existing page or open the assistant with
 * a real prompt. Fails quietly: if the endpoint is unavailable the card
 * simply doesn't render, so the dashboard never depends on it.
 */
import { ArrowRight, Lightbulb, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiClient } from "@/services/apiClient";
import { toDateKey } from "@/services/foodLog/calculations";
import { Badge, Card } from "@/components/ui/core";
import type { Recommendation } from "@/services/ai/types";

export function SmartRecommendations({ refreshKey }: { refreshKey?: unknown }) {
  const [items, setItems] = useState<Recommendation[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const task = setTimeout(() => {
      apiClient
        .get<{ recommendations: Recommendation[] }>(`/api/assistant/recommendations?today=${toDateKey()}&hour=${new Date().getHours()}`)
        .then((data) => {
          if (!cancelled) setItems(data.recommendations);
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(task);
    };
  }, [refreshKey]);

  if (failed) return null;

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-line bg-brand-50/60 px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
          <Lightbulb className="h-4 w-4 text-brand-400" aria-hidden="true" />
          Smart suggestions
        </h2>
        <Link href="/assistant" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-400 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500">
          <Sparkles className="h-3 w-3" aria-hidden="true" /> Ask
        </Link>
      </div>
      <div className="p-4">
        {items === null ? (
          <div className="space-y-2" aria-label="Loading suggestions">
            <div className="skeleton h-12" />
            <div className="skeleton h-12" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted">Nothing to suggest right now — you&rsquo;re up to date.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => {
              const href = item.href ?? `/assistant?q=${encodeURIComponent(item.prompt ?? item.title)}`;
              const open = expanded === item.id;
              return (
                <li key={item.id} className="entry-enter rounded-[12px] border border-line bg-surface p-3 transition-colors hover:border-brand-400/40">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">{item.title}</p>
                      <p className="mt-0.5 text-xs text-muted">{item.detail}</p>
                    </div>
                    <Badge tone="neutral" className="shrink-0 px-2 py-0.5 text-[10px]">{item.source}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Link href={href} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-400 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500">
                      {item.cta} <ArrowRight className="h-3 w-3" aria-hidden="true" />
                    </Link>
                    <button type="button" onClick={() => setExpanded(open ? null : item.id)} aria-expanded={open} className="text-[11px] font-semibold text-muted hover:text-ink">
                      {open ? "Hide reason" : "Why?"}
                    </button>
                  </div>
                  {open && <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{item.reason}</p>}
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-muted">Chosen from your logs, plan and pantry. General planning information, not medical advice.</p>
      </div>
    </Card>
  );
}
