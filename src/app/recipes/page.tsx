import type { Metadata } from "next";
import { RecipeLibrary } from "@/components/recipes/RecipeLibrary";

export const metadata: Metadata = { title: "Recipes" };

export default function RecipesPage() {
  return <RecipeLibrary />;
}
