"use client";

/**
 * Reusable summary cards for the Review, Profile and Diet Plan pages.
 *
 * They render real profile data — never fabricated values — and show a
 * neutral "—" / "Not specified" when a field is empty. Every page reuses
 * these components instead of duplicating markup.
 */
import type { ReactNode } from "react";
import {
  ACTIVITY_LEVELS,
  allergenLabel,
  CUISINES,
  DIETARY_TYPES,
  FOOD_AVAILABILITY_OPTIONS,
  formatQuantity,
  formatTime,
  GENDER_OPTIONS,
  GOALS,
  intoleranceLabel,
  labelFor,
  LATE_NIGHT_EATING_OPTIONS,
  MEAL_PREP_PREFERENCE_OPTIONS,
  MEAL_PREP_TIME_OPTIONS,
  MEALS,
  SNACKING_FREQUENCY_OPTIONS,
  WEEKEND_DIFFERENCE_OPTIONS,
} from "@/data/options";
import type {
  DietaryPreferences,
  FoodIntake,
  MealHabits,
  MealTimings,
  NutritionalInformation,
  PersonalDetails,
  PracticalConstraints,
  WaterIntake,
} from "@/types/profile";
import { titleCase } from "@/lib/normalize";
import { Card, CardBody } from "@/components/ui/core";

const EMPTY = "—";

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line/70 py-2.5 last:border-b-0">
      <dt className="shrink-0 text-xs font-medium text-muted">{label}</dt>
      <dd
        className={
          strong
            ? "text-right text-sm font-bold text-ink"
            : "text-right text-sm font-semibold text-ink"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function ChipRow({
  label,
  values,
  tone = "neutral",
  emptyText = EMPTY,
}: {
  label: string;
  values: string[];
  tone?: "neutral" | "danger" | "warning";
  emptyText?: string;
}) {
  const toneClass =
    tone === "danger"
      ? "border-danger-500/30 bg-danger-50 text-danger-700"
      : tone === "warning"
        ? "border-accent-300/40 bg-accent-200/40 text-accent-300"
        : "border-line bg-surface text-ink";

  return (
    <div className="flex items-start justify-between gap-4 border-b border-line/70 py-2.5 last:border-b-0">
      <dt className="shrink-0 text-xs font-medium text-muted">{label}</dt>
      <dd className="max-w-[62%]">
        {values.length === 0 ? (
          <span className="text-sm font-semibold text-muted">{emptyText}</span>
        ) : (
          <div className="flex flex-wrap justify-end gap-1.5">
            {values.map((value) => (
              <span
                key={value}
                className={`rounded-pill border px-2.5 py-0.5 text-xs font-semibold ${toneClass}`}
              >
                {value}
              </span>
            ))}
          </div>
        )}
      </dd>
    </div>
  );
}

function CardShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Card className="h-full">
      <div className="border-b border-line bg-brand-50/60 px-5 py-3.5">
        <h3 className="text-sm font-bold text-ink">{title}</h3>
      </div>
      <CardBody className="pt-3">{children}</CardBody>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Part 2                                                              */
/* ------------------------------------------------------------------ */

export function PersonalDetailsSummary({
  details,
}: {
  details: PersonalDetails;
}) {
  return (
    <CardShell title="Personal Information">
      <dl>
        <Row label="Full name" value={details.fullName.trim() || EMPTY} strong />
        <Row
          label="Age"
          value={details.age !== null ? `${details.age} years` : EMPTY}
        />
        <Row
          label="Gender"
          value={details.gender ? labelFor(GENDER_OPTIONS, details.gender) : EMPTY}
        />
        <Row
          label="Height"
          value={details.heightCm !== null ? `${details.heightCm} cm` : EMPTY}
        />
        <Row
          label="Weight"
          value={details.weightKg !== null ? `${details.weightKg} kg` : EMPTY}
        />
        <Row
          label="Activity level"
          value={
            details.activityLevel
              ? labelFor(ACTIVITY_LEVELS, details.activityLevel)
              : EMPTY
          }
        />
        <Row
          label="Occupation / lifestyle"
          value={details.occupationOrLifestyle.trim() || EMPTY}
        />
      </dl>
    </CardShell>
  );
}

/* ------------------------------------------------------------------ */
/* Part 3                                                              */
/* ------------------------------------------------------------------ */

export function NutritionSummaryCard({
  nutrition,
}: {
  nutrition: NutritionalInformation;
}) {
  return (
    <CardShell title="Nutrition Information">
      <dl>
        <Row
          label="Primary goal"
          value={nutrition.primaryGoal ? labelFor(GOALS, nutrition.primaryGoal) : EMPTY}
          strong
        />
        <Row
          label="Daily calorie target"
          value={
            nutrition.dailyCalorieTarget !== null
              ? `${nutrition.dailyCalorieTarget.toLocaleString()} kcal`
              : "Not specified"
          }
        />
        <Row
          label="Daily protein target"
          value={
            nutrition.proteinTargetGrams !== null
              ? `${nutrition.proteinTargetGrams} g/day`
              : "Not specified"
          }
        />
      </dl>
    </CardShell>
  );
}

export function PreferencesSummary({
  preferences,
  allergies,
  intolerances,
  preferredFoods,
  foodsToAvoid,
}: {
  preferences: DietaryPreferences;
  allergies: string[];
  intolerances: string[];
  preferredFoods: string[];
  foodsToAvoid: string[];
}) {
  return (
    <CardShell title="Dietary Preferences & Restrictions">
      <dl>
        <Row
          label="Dietary pattern"
          value={
            preferences.dietaryType
              ? labelFor(DIETARY_TYPES, preferences.dietaryType)
              : EMPTY
          }
          strong
        />
        <ChipRow
          label="Preferred cuisines"
          values={preferences.preferredCuisines.map((id) => labelFor(CUISINES, id))}
        />
        <ChipRow
          label="Allergies"
          values={allergies.map(allergenLabel)}
          tone="danger"
          emptyText="None declared"
        />
        <ChipRow
          label="Intolerances"
          values={intolerances.map(intoleranceLabel)}
          tone="warning"
          emptyText="None declared"
        />
        <ChipRow label="Preferred foods" values={preferredFoods.map(titleCase)} />
        <ChipRow label="Foods to avoid" values={foodsToAvoid.map(titleCase)} />
      </dl>
      {preferences.foodPreferenceNotes.trim() && (
        <p className="mt-3 rounded-[10px] bg-canvas p-3 text-xs leading-relaxed text-muted">
          “{preferences.foodPreferenceNotes.trim()}”
        </p>
      )}
    </CardShell>
  );
}

/* ------------------------------------------------------------------ */
/* Part 4                                                              */
/* ------------------------------------------------------------------ */

export function FoodIntakeSummary({ intake }: { intake: FoodIntake }) {
  return (
    <CardShell title="Food Intake">
      <ul className="divide-y divide-line/70">
        {MEALS.map((definition) => {
          const meal = intake[definition.id];
          const items = meal.items.filter((item) => item.name.trim());

          return (
            <li key={definition.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-3">
                <h4 className="text-xs font-bold uppercase tracking-[0.14em] text-brand-400">
                  {definition.label}
                </h4>
                {!meal.hasMeal && (
                  <span className="text-xs font-semibold text-muted">
                    Usually skipped
                  </span>
                )}
              </div>

              {meal.hasMeal &&
                (items.length === 0 ? (
                  <p className="mt-1 text-sm text-muted">{EMPTY}</p>
                ) : (
                  <ul className="mt-1.5 space-y-1">
                    {items.map((item) => {
                      const quantity = formatQuantity(item.quantity, item.unit);
                      return (
                        <li
                          key={item.id}
                          className="flex items-baseline justify-between gap-3 text-sm"
                        >
                          <span className="font-semibold text-ink">
                            {item.name}
                            {item.notes.trim() && (
                              <span className="ml-1.5 font-normal text-muted">
                                ({item.notes.trim()})
                              </span>
                            )}
                          </span>
                          {quantity && (
                            <span className="shrink-0 text-xs font-medium text-muted">
                              {quantity}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ))}

              {meal.hasMeal && meal.notes.trim() && (
                <p className="mt-1.5 text-xs italic text-muted">
                  {meal.notes.trim()}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </CardShell>
  );
}

export function MealTimingsSummary({ timings }: { timings: MealTimings }) {
  const specified = MEALS.filter((meal) => timings[meal.id]);

  return (
    <CardShell title="Meal Timings">
      {specified.length === 0 ? (
        <p className="text-sm text-muted">No meal timings specified.</p>
      ) : (
        <dl>
          {specified.map((meal) => (
            <Row
              key={meal.id}
              label={meal.label}
              value={formatTime(timings[meal.id])}
            />
          ))}
        </dl>
      )}
    </CardShell>
  );
}

export function MealHabitsSummary({
  habits,
  water,
}: {
  habits: MealHabits;
  water: WaterIntake;
}) {
  const mealsPerDay =
    habits.mealsPerDay === null
      ? EMPTY
      : habits.mealsPerDay >= 7
        ? "More than 6"
        : `${habits.mealsPerDay} meals`;

  const waterValue =
    water.sourceUnit === "unknown"
      ? "Not sure"
      : water.litresPerDay !== null
        ? `${water.litresPerDay} L/day`
        : EMPTY;

  return (
    <CardShell title="Meal Habits & Hydration">
      <dl>
        <Row label="Meals per day" value={mealsPerDay} />
        <Row
          label="Snacking between meals"
          value={
            habits.snackingFrequency
              ? labelFor(SNACKING_FREQUENCY_OPTIONS, habits.snackingFrequency)
              : EMPTY
          }
        />
        <Row
          label="Eating late at night"
          value={
            habits.lateNightEating
              ? labelFor(LATE_NIGHT_EATING_OPTIONS, habits.lateNightEating)
              : EMPTY
          }
        />
        <Row label="Water intake" value={waterValue} strong />
      </dl>
      {water.sourceUnit === "glasses" && water.litresPerDay !== null && (
        <p className="mt-2 text-xs text-muted">
          Entered in glasses and converted at 250 ml per glass.
        </p>
      )}
    </CardShell>
  );
}

export function PracticalConstraintsSummary({
  constraints,
  additionalInformation,
}: {
  constraints: PracticalConstraints;
  additionalInformation: string;
}) {
  return (
    <CardShell title="Practical Information">
      <dl>
        <Row
          label="Typical daily schedule"
          value={constraints.typicalDailySchedule.trim() || EMPTY}
        />
        <ChipRow
          label="Food availability"
          values={constraints.foodAvailability.map((id) =>
            labelFor(FOOD_AVAILABILITY_OPTIONS, id),
          )}
        />
        <Row
          label="Meal preparation time"
          value={
            constraints.mealPreparationTime
              ? labelFor(MEAL_PREP_TIME_OPTIONS, constraints.mealPreparationTime)
              : EMPTY
          }
        />
        <Row
          label="Preparation preference"
          value={
            constraints.mealPreparationPreference
              ? labelFor(
                  MEAL_PREP_PREFERENCE_OPTIONS,
                  constraints.mealPreparationPreference,
                )
              : EMPTY
          }
        />
        <Row
          label="Weekend habits differ"
          value={
            constraints.weekendDifference
              ? labelFor(WEEKEND_DIFFERENCE_OPTIONS, constraints.weekendDifference)
              : EMPTY
          }
        />
      </dl>

      {constraints.weekendNotes.trim() && (
        <p className="mt-3 rounded-[10px] bg-canvas p-3 text-xs leading-relaxed text-muted">
          Weekends: {constraints.weekendNotes.trim()}
        </p>
      )}
      {additionalInformation.trim() && (
        <div className="mt-3 rounded-[10px] bg-canvas p-3">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">
            Additional information
          </p>
          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-ink">
            {additionalInformation.trim()}
          </p>
        </div>
      )}
    </CardShell>
  );
}
