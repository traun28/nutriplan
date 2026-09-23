"use client";

/**
 * Route-level error boundary — keeps the application usable if an
 * unexpected error occurs instead of crashing the whole page.
 */
import { useEffect } from "react";
import { Button } from "@/components/ui/core";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the error to the console for debugging during development.
    console.error(error);
  }, [error]);

  return (
    <div className="grid min-h-[60dvh] place-items-center px-5 py-16">
      <div className="w-full max-w-md text-center">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-danger-600">
          Unexpected error
        </p>
        <h1 className="mt-2 text-2xl font-bold text-ink">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          The application hit an unexpected problem. Your information is kept
          in your session — try again, or return home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button onClick={reset}>Try again</Button>
          <Button href="/" variant="outline">
            Go home
          </Button>
        </div>
      </div>
    </div>
  );
}
