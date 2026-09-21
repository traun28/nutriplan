"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";

export function FloatingAssistantButton() {
  return (
    <Link
      href="/assistant"
      aria-label="Open Personal AI"
      title="Open Personal AI"
      className="fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-pill bg-brand-600 px-4 py-3 text-sm font-bold text-white shadow-[0_10px_28px_rgba(61,106,79,0.35)] transition-transform hover:-translate-y-1 hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 sm:bottom-7 sm:right-7"
    >
      <Sparkles className="h-4 w-4" aria-hidden="true" />
      <span>Personal AI</span>
    </Link>
  );
}
