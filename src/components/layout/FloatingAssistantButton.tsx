"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Personal AI launcher.
 *
 * Kept deliberately small. On phones it is an icon-only disc — the previous
 * labelled pill was wide enough at the bottom-right to cover list rows, form
 * submit buttons and card actions. From `sm` up it grows back into the labelled
 * pill, so nothing is lost on larger screens.
 *
 * It is pinned *inside* the viewport: `right-4` plus a
 * `max-w-[calc(100%-2rem)]` cap mean it can never run off a 320px screen
 * (`100%` rather than `100vw`, which would include the scrollbar), and
 * `env(safe-area-inset-bottom)` keeps it clear of a device home indicator.
 * `.page-section` and the footer reserve matching bottom space so the disc
 * cannot sit on top of the last control on a page, and it is not rendered at
 * all on `/assistant`, where it would cover the chat input's send button.
 */
export function FloatingAssistantButton() {
  const pathname = usePathname();

  // On the assistant page the launcher would land directly on the chat's send
  // button, and it is redundant there anyway — the user is already in it.
  if (pathname?.startsWith("/assistant")) return null;

  return (
    <Link
      href="/assistant"
      aria-label="Open Personal AI"
      title="Open Personal AI"
      className={cn(
        "fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[60]",
        "flex max-w-[calc(100%-2rem)] items-center justify-center gap-2 rounded-pill",
        "bg-brand-700 text-sm font-bold text-white",
        "shadow-[0_10px_28px_rgba(5,150,105,0.35)] transition-transform",
        "hover:-translate-y-0.5 hover:bg-brand-800",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
        // Phones: compact 48px disc, icon only.
        "h-12 w-12 shrink-0 p-0",
        // sm+: labelled pill, slightly further from the edges.
        "sm:bottom-6 sm:right-6 sm:h-auto sm:w-auto sm:px-3.5 sm:py-2.5",
      )}
    >
      <Sparkles className="h-5 w-5 shrink-0 sm:h-4 sm:w-4" aria-hidden="true" />
      <span className="hidden whitespace-nowrap sm:inline">Personal AI</span>
    </Link>
  );
}
