"use client";

/**
 * Compact floating shortcut to the Personal AI assistant. Hidden on the
 * assistant page itself (where it would cover the chat input), icon-only
 * on small screens so it never overlaps forms, cards or navigation, and
 * pinned inside the viewport with safe-area insets.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";

export function FloatingAssistantButton() {
  const pathname = usePathname();
  // The chat already lives on this page — the floating control would only
  // cover the input and the last message bubbles.
  if (pathname?.startsWith("/assistant")) return null;

  return (
    <Link
      href="/assistant"
      aria-label="Open Personal AI"
      title="Open Personal AI"
      className="fixed bottom-4 right-4 z-[60] flex h-11 items-center gap-2 rounded-pill bg-brand-700 px-3 text-sm font-bold text-white shadow-[0_10px_28px_rgba(5,150,105,0.35)] transition-transform hover:-translate-y-0.5 hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 sm:bottom-6 sm:right-6 sm:px-4"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
    >
      <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="hidden sm:inline">Personal AI</span>
    </Link>
  );
}
