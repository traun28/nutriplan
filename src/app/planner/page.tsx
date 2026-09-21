import { Suspense } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import PlannerApp from "@/components/planner/PlannerApp";

/**
 * The useSearchParams hook in PlannerApp must live inside a Suspense
 * boundary, so the route is a thin shell over the real client app.
 */
export default function PlannerPage() {
  return (
    <RequireAuth>
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-5 py-14">
          <div className="h-8 w-40 animate-pulse rounded-lg bg-line" />
          <div className="mt-6 h-64 animate-pulse rounded-card bg-line/60" />
        </div>
      }
    >
      <PlannerApp />
    </Suspense>
    </RequireAuth>
  );
}
