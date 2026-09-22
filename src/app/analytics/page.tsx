import type { Metadata } from "next";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { NutritionAnalytics } from "@/components/analytics/NutritionAnalytics";

export const metadata: Metadata = { title: "Nutrition Analytics" };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  return (
    <RequireAuth>
      <NutritionAnalytics initialView={view === "week" ? "week" : "day"} />
    </RequireAuth>
  );
}
