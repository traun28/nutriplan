import type { Metadata } from "next";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { PantryManager } from "@/components/pantry/PantryManager";

export const metadata: Metadata = { title: "My Pantry" };

export default function PantryPage() {
  return (
    <RequireAuth>
      <PantryManager />
    </RequireAuth>
  );
}
