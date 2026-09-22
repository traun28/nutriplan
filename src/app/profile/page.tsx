"use client";

import { RequireAuth } from "@/components/auth/RequireAuth";

/**
 * My Profile — the saved-profile view and management screen (Part 5).
 *
 * Shows the stored information in human-readable form plus the profile
 * lifecycle actions: edit, start a new profile, and delete. Both
 * destructive actions are protected by a confirmation dialog.
 */
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Circle,
  FilePlus2,
  PencilLine,
  Trash2,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useProfile } from "@/context/ProfileContext";
import { useNutrition } from "@/context/NutritionContext";
import { formatDateTime } from "@/lib/numbers";
import { Badge, Button, Card, CardBody, EmptyState } from "@/components/ui/core";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  FoodIntakeSummary,
  MealHabitsSummary,
  MealTimingsSummary,
  NutritionSummaryCard,
  PersonalDetailsSummary,
  PracticalConstraintsSummary,
  PreferencesSummary,
} from "@/components/review/SummaryCards";

type DialogKind = "new" | "delete" | null;

function ProfileView() {
  const {
    profile,
    hydrated,
    completion,
    hasSavedProfile,
    hasUnsavedChanges,
    storageStatus,
    storageMessage,
    deleteSavedProfile,
    startNewProfile,
    discardCorruptData,
  } = useProfile();
  const { clearResults } = useNutrition();
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogKind>(null);

  // Page chrome renders immediately; only the data region is a skeleton,
  // so the screen is never a large blank area while loading.
  if (!hydrated) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <header className="mb-6">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-400">
            My Profile
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            Your Profile
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Loading your saved information…
          </p>
        </header>
        <div className="grid gap-4 sm:gap-5 xl:grid-cols-[280px_1fr]">
          <div className="h-44 animate-pulse rounded-card bg-line/40" />
          <div className="space-y-4">
            <div className="h-28 animate-pulse rounded-card bg-line/40" />
            <div className="h-28 animate-pulse rounded-card bg-line/30" />
          </div>
        </div>
      </div>
    );
  }

  /* --------------------- corrupted storage state -------------------- */
  if (storageStatus === "corrupt") {
    return (
      <div className="mx-auto grid w-full max-w-2xl place-items-center px-4 py-10 sm:px-6">
        <Card>
          <CardBody>
            <div className="flex items-start gap-3">
              <AlertTriangle
                className="mt-0.5 h-6 w-6 shrink-0 text-danger-600"
                aria-hidden="true"
              />
              <div>
                <h1 className="text-lg font-bold text-ink">
                  Saved data could not be read
                </h1>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                  {storageMessage ??
                    "The information stored in this browser appears to be damaged."}{" "}
                  You can remove the damaged data and start a fresh profile.
                  Nothing else on your device is affected.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Button variant="danger" onClick={discardCorruptData}>
                    Remove damaged data
                  </Button>
                  <Button href="/" variant="outline">
                    Go home
                  </Button>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  /* ------------------------- empty profile -------------------------- */
  if (!hasSavedProfile && !completion.hasAnyData) {
    return (
      <div className="mx-auto grid w-full max-w-3xl place-items-center px-4 py-10 sm:px-6">
        <EmptyState
          icon={<UserRound className="h-6 w-6" aria-hidden="true" />}
          title="No saved profile yet"
          description="Start the questionnaire to build your nutrition profile. Your answers are saved on this device when you press Save on the review page."
          action={
            <Button href="/planner" icon={<ArrowRight className="h-4 w-4" />}>
              Create My Profile
            </Button>
          }
        />
      </div>
    );
  }

  const firstName = profile.personalDetails.fullName.trim().split(" ")[0];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-400">
            My Profile
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            {firstName ? `Welcome back, ${firstName}` : "Your Profile"}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {hasSavedProfile ? (
              hasUnsavedChanges ? (
                <Badge tone="warning">
                  <TriangleAlert className="h-3 w-3" aria-hidden="true" />
                  Unsaved changes
                </Badge>
              ) : (
                <Badge tone="brand">
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  Profile saved
                </Badge>
              )
            ) : (
              <Badge tone="neutral">Draft — not saved yet</Badge>
            )}
            {profile.updatedAt && (
              <span className="text-xs text-muted">
                Last updated {formatDateTime(profile.updatedAt)}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <Button
            href="/planner?step=1"
            variant="outline"
            icon={<PencilLine className="h-4 w-4" />}
          >
            Edit Profile
          </Button>
          <Button
            variant="outline"
            onClick={() => setDialog("new")}
            icon={<FilePlus2 className="h-4 w-4" />}
          >
            Start New Profile
          </Button>
          {hasSavedProfile && (
            <Button
              variant="ghost"
              onClick={() => setDialog("delete")}
              icon={<Trash2 className="h-4 w-4" />}
            >
              Delete Saved Profile
            </Button>
          )}
        </div>
      </header>

      {hasUnsavedChanges && (
        <div
          role="status"
          className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-card border border-accent-300/40/30 bg-accent-200/30 p-4"
        >
          <p className="text-xs leading-relaxed text-ink/80">
            You have changes that have not been saved to this device yet.
          </p>
          <Button size="sm" href="/review" icon={<ArrowRight className="h-3.5 w-3.5" />}>
            Go to Review &amp; Save
          </Button>
        </div>
      )}

      <div className="grid items-start gap-4 sm:gap-5 xl:grid-cols-[280px_1fr]">
        {/* --------------------- completion sidebar -------------------- */}
        <Card>
          <div className="border-b border-line bg-brand-50/60 px-5 py-3.5">
            <h2 className="text-sm font-bold text-ink">Profile completeness</h2>
          </div>
          <CardBody>
            <p className="text-sm text-muted">
              <strong className="text-ink">
                {completion.completedSections} of {completion.totalSections}
              </strong>{" "}
              questionnaire sections complete.
            </p>
            <ul className="mt-4 space-y-3">
              {[
                { label: "Personal details", done: completion.personalComplete, step: 1 },
                { label: "Nutrition & preferences", done: completion.nutritionComplete, step: 2 },
                { label: "Food intake & habits", done: completion.foodIntakeComplete, step: 3 },
              ].map((item) => (
                <li key={item.label} className="flex items-center gap-3">
                  {item.done ? (
                    <CheckCircle2
                      className="h-5 w-5 shrink-0 text-brand-400"
                      aria-hidden="true"
                    />
                  ) : (
                    <Circle className="h-5 w-5 shrink-0 text-line" aria-hidden="true" />
                  )}
                  <span
                    className={
                      item.done
                        ? "text-sm font-semibold text-ink"
                        : "text-sm font-medium text-muted"
                    }
                  >
                    {item.label}
                  </span>
                  {!item.done && (
                    <Button
                      href={`/planner?step=${item.step}`}
                      variant="ghost"
                      size="sm"
                      className="ml-auto !px-2 !py-1 text-xs"
                    >
                      Add
                    </Button>
                  )}
                </li>
              ))}
            </ul>

            <dl className="mt-5 space-y-2 border-t border-line pt-4 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Created</dt>
                <dd className="font-semibold text-ink">
                  {formatDateTime(profile.createdAt)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Last updated</dt>
                <dd className="font-semibold text-ink">
                  {formatDateTime(profile.updatedAt)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Profile version</dt>
                <dd className="font-semibold text-ink">
                  v{profile.profileVersion}
                </dd>
              </div>
            </dl>

            <p className="mt-4 rounded-[10px] bg-canvas p-3 text-xs leading-relaxed text-muted">
              Your profile is stored locally in this browser on this device. It
              is never sent to any external service.
            </p>
          </CardBody>
        </Card>

        {/* ------------------------ profile detail --------------------- */}
        <div className="grid gap-4 sm:gap-5 md:grid-cols-2">
          <PersonalDetailsSummary details={profile.personalDetails} />
          <NutritionSummaryCard nutrition={profile.nutritionalInformation} />
          <div className="sm:col-span-2">
            <PreferencesSummary
              preferences={profile.dietaryPreferences}
              allergies={profile.allergies}
              intolerances={profile.intolerances}
              preferredFoods={profile.preferredFoods}
              foodsToAvoid={profile.foodsToAvoid}
            />
          </div>
          <FoodIntakeSummary intake={profile.foodIntake} />
          <div className="space-y-5">
            <MealTimingsSummary timings={profile.mealTimings} />
            <MealHabitsSummary
              habits={profile.mealHabits}
              water={profile.waterIntake}
            />
          </div>
          <div className="sm:col-span-2">
            <PracticalConstraintsSummary
              constraints={profile.practicalConstraints}
              additionalInformation={profile.additionalInformation}
            />
          </div>
        </div>
      </div>

      {/* --------------------------- dialogs --------------------------- */}
      <ConfirmDialog
        open={dialog === "new"}
        tone="brand"
        title="Start a new profile?"
        description="The questionnaire will be cleared so you can enter fresh information. Your currently saved profile stays on this device until you save the new one."
        confirmLabel="Start new profile"
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          startNewProfile();
          setDialog(null);
          router.push("/planner?step=1");
        }}
      />

      <ConfirmDialog
        open={dialog === "delete"}
        title="Delete your saved profile?"
        description="Your saved information and any calculated nutrition results will be removed from this browser. This cannot be undone."
        confirmLabel="Delete profile"
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          deleteSavedProfile();
          clearResults();
          setDialog(null);
        }}
      />
    </div>
  );
}

/** Protected route: requires an authenticated session. */
export default function ProfilePage() {
  return (
    <RequireAuth>
      <ProfileView />
    </RequireAuth>
  );
}
