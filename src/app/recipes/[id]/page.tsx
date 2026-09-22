import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RecipeDetail } from "@/components/recipes/RecipeDetail";
import { getRecipe } from "@/services/recipes/recipeService";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const recipe = getRecipe((await params).id);
  return { title: recipe ? recipe.name : "Recipe not found" };
}

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recipe = getRecipe(id);
  if (!recipe) notFound();
  // Shared read-only data is rendered on the server; user-specific state
  // (favourite, restriction verdict, plan/log actions) loads client-side.
  return <RecipeDetail recipe={recipe} />;
}
