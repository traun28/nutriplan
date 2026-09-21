"use client";

/**
 * Reusable confirmation dialog for destructive or irreversible actions
 * (Start New Profile, Delete Saved Profile).
 *
 * Built on the native <dialog>-like pattern with focus trapping kept
 * simple: focus moves to the cancel button on open and Escape closes.
 */
import { AlertTriangle } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/core";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "danger" | "brand";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-ink/40 px-4 py-6 backdrop-blur-sm"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        className="w-full max-w-md rounded-card border border-line bg-surface p-6 shadow-pop"
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className={
              tone === "danger"
                ? "grid h-10 w-10 shrink-0 place-items-center rounded-full bg-danger-50 text-danger-600"
                : "grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700"
            }
          >
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2
              id="confirm-dialog-title"
              className="text-base font-bold text-ink"
            >
              {title}
            </h2>
            <p
              id="confirm-dialog-description"
              className="mt-1.5 text-sm leading-relaxed text-muted"
            >
              {description}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <Button ref={cancelRef} variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
