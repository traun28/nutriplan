import type { Metadata } from "next";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { GroceryList } from "@/components/grocery/GroceryList";

export const metadata: Metadata = { title: "Grocery List" };

export default function GroceryPage() {
  return (
    <RequireAuth>
      <GroceryList />
    </RequireAuth>
  );
}
