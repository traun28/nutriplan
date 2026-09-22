import type { Metadata } from "next";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { ProgressTracker } from "@/components/progress/ProgressTracker";

export const metadata: Metadata = { title: "Progress Tracking" };

export default function ProgressPage() {
  return (
    <RequireAuth>
      <ProgressTracker />
    </RequireAuth>
  );
}
