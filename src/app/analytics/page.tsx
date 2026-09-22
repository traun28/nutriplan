import type { Metadata } from "next";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { NutritionAnalytics } from "@/components/analytics/NutritionAnalytics";

export const metadata: Metadata = { title: "Nutrition Analytics" };

export default function AnalyticsPage() {
  return (
    <RequireAuth>
      <NutritionAnalytics />
    </RequireAuth>
  );
}
