import type { Metadata } from "next";
import { DailyDashboard } from "@/components/dashboard/DailyDashboard";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return <DailyDashboard />;
}
