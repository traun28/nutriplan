import type { Metadata } from "next";
import { FoodHistory } from "@/components/food-log/FoodHistory";

export const metadata: Metadata = { title: "Food history" };

export default function HistoryPage() {
  return <FoodHistory />;
}
