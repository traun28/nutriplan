"use client";

/**
 * Small, polite status toast for save / delete feedback. One at a time,
 * auto-dismisses, announced via aria-live.
 */
import { CheckCircle2, TriangleAlert, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export interface ToastState {
  id: number;
  message: string;
  tone: "success" | "error";
}

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setToast(null);
  }, []);

  const show = useCallback((message: string, tone: "success" | "error" = "success") => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Date.now(), message, tone });
    timer.current = setTimeout(() => setToast(null), tone === "error" ? 6000 : 3500);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { toast, show, dismiss };
}

export function Toast({ toast, onDismiss }: { toast: ToastState | null; onDismiss: () => void }) {
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed inset-x-0 bottom-5 z-[90] flex justify-center px-4"
    >
      {toast && (
        <div
          key={toast.id}
          role="status"
          className={cn(
            "entry-enter pointer-events-auto flex max-w-md items-start gap-3 rounded-card border px-4 py-3 shadow-pop",
            toast.tone === "success"
              ? "border-brand-400/25 bg-surface text-ink"
              : "border-danger-500/30 bg-surface text-danger-700",
          )}
        >
          {toast.tone === "success" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" aria-hidden="true" />
          ) : (
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger-600" aria-hidden="true" />
          )}
          <p className="text-sm leading-relaxed">{toast.message}</p>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss notification"
            className="ml-1 grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted hover:bg-line/60 hover:text-ink"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
