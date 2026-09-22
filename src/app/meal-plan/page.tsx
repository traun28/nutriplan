import type { Metadata } from "next";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { WeeklyPlanner } from "@/components/meal-plan/WeeklyPlanner";

export const metadata: Metadata = { title: "7-Day Meal Plan" };

export default function MealPlanPage() {
  return (
    <RequireAuth>
      <WeeklyPlanner />
    </RequireAuth>
  );
}
