"use client";

/**
 * Lightweight guard that warns before the browser tab is closed or
 * reloaded while the questionnaire holds unsaved edits (Part 5).
 *
 * Deliberately minimal: it only hooks `beforeunload`, so in-app
 * navigation stays instant and never shows an intrusive prompt.
 */
import { useEffect } from "react";

export function useUnsavedChangesWarning(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Required by some browsers for the native prompt to appear.
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [enabled]);
}
