"use client";

/**
 * Part 15 — route protection.
 *
 * Waits for the session check to finish before deciding, so protected pages
 * never render behind a permanent loading state and never flash content for
 * a signed-out visitor. If the session check itself fails, the user gets an
 * error with a Retry instead of a frozen screen.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/core";

export function RequireAuth({
  children,
  redirectTo = "/login",
}: {
  children: React.ReactNode;
  redirectTo?: string;
}) {
  const { user, loading, error, refresh } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user && !error) {
      const current =
        typeof window !== "undefined"
          ? window.location.pathname + window.location.search
          : "";
      const target = current
        ? `${redirectTo}?next=${encodeURIComponent(current)}`
        : redirectTo;
      router.replace(target);
    }
  }, [loading, user, error, router, redirectTo]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-20">
        <div className="flex items-center gap-3 text-sm text-muted">
          <Loader2 className="h-5 w-5 animate-spin text-brand-600" aria-hidden="true" />
          Checking your session…
        </div>
        <div className="mt-6 h-48 animate-pulse rounded-card bg-line/40" />
      </div>
    );
  }

  if (error && !user) {
    return (
      <div className="mx-auto max-w-lg px-5 py-20">
        <div className="rounded-card border border-danger-100 bg-danger-50/60 p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle
              className="mt-0.5 h-5 w-5 shrink-0 text-danger-600"
              aria-hidden="true"
            />
            <div>
              <h1 className="text-base font-bold text-danger-700">
                We couldn&rsquo;t reach your account
              </h1>
              <p className="mt-1 text-sm text-danger-700/90">{error}</p>
              <div className="mt-4 flex flex-wrap gap-2.5">
                <Button size="sm" onClick={() => void refresh()} icon={<RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}>
                  Retry
                </Button>
                <Button size="sm" variant="outline" href="/login">
                  Go to login
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    // Redirect is handled in the effect; render nothing visible meanwhile.
    return (
      <div className="mx-auto max-w-3xl px-5 py-20">
        <div className="flex items-center gap-3 text-sm text-muted">
          <Loader2 className="h-5 w-5 animate-spin text-brand-600" aria-hidden="true" />
          Redirecting to login…
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
