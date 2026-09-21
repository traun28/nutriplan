"use client";

/**
 * Step 5 — compact in-planner review. The full, sectioned review page
 * (with Edit actions and the Save action) lives at /review; this step
 * gives a quick summary and a bridge to it.
 */
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { useProfile } from "@/context/ProfileContext";
import { PlannerSection } from "@/components/planner/PlannerSection";
import {
  FoodIntakeSummary,
  NutritionSummaryCard,
  PersonalDetailsSummary,
  PreferencesSummary,
} from "@/components/review/SummaryCards";
import { Card, CardBody } from "@/components/ui/core";

export function ReviewStep({ onBack }: { onBack: () => void }) {
  const { profile, completion } = useProfile();
  const router = useRouter();

  return (
    <PlannerSection
      stepLabel="Step 5 of 5 · Review"
      title="Review your information"
      description="Check everything before saving. The full review page shows every section with edit links and the save action."
      onBack={onBack}
      onContinue={() => router.push("/review")}
      continueLabel="Open Full Review"
      continueIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
    >
      {completion.personalComplete ? (
        <PersonalDetailsSummary details={profile.personalDetails} />
      ) : (
        <Card>
          <CardBody className="text-sm text-muted">
            Personal details not completed yet.
          </CardBody>
        </Card>
      )}

      {completion.nutritionComplete ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <NutritionSummaryCard nutrition={profile.nutritionalInformation} />
          <PreferencesSummary
            preferences={profile.dietaryPreferences}
            allergies={profile.allergies}
            intolerances={profile.intolerances}
            preferredFoods={profile.preferredFoods}
            foodsToAvoid={profile.foodsToAvoid}
          />
        </div>
      ) : (
        <Card>
          <CardBody className="text-sm text-muted">
            Nutrition &amp; preferences not completed yet.
          </CardBody>
        </Card>
      )}

      <FoodIntakeSummary intake={profile.foodIntake} />
    </PlannerSection>
  );
}
