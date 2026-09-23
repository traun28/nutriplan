"use client";

/**
 * Part 4 — Food Intake, meal timings, habits, hydration, practical
 * constraints and additional information (questionnaire step 4 of 5).
 *
 * Every control is bound to the central UserProfile, so answers survive
 * navigation and can be edited later from the Review page.
 *
 * Nothing here is calculated: Part 6 owns all nutrition maths.
 */
import {
  ClipboardList,
  Clock,
  CupSoda,
  Info,
  NotebookPen,
  Repeat,
  Utensils,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useProfile } from "@/context/ProfileContext";
import {
  FOOD_AVAILABILITY_OPTIONS,
  LATE_NIGHT_EATING_OPTIONS,
  MEAL_PREP_PREFERENCE_OPTIONS,
  MEAL_PREP_TIME_OPTIONS,
  MEALS,
  MEALS_PER_DAY_OPTIONS,
  SNACKING_FREQUENCY_OPTIONS,
  WATER_UNIT_OPTIONS,
  WEEKEND_DIFFERENCE_OPTIONS,
} from "@/data/options";
import { validateFoodIntake, LIMITS } from "@/lib/validation";
import { LITRES_PER_GLASS } from "@/lib/profileNormalize";
import { roundTo } from "@/lib/numbers";
import type { MealHabits, PracticalConstraints, WaterIntake } from "@/types/profile";
import { PlannerSection } from "@/components/planner/PlannerSection";
import { MealSection } from "@/components/planner/food-intake/MealSection";
import { FoodSuggestions } from "@/components/planner/food-intake/FoodItemRow";
import {
  NumberField,
  SelectField,
  TextAreaField,
  TimeField,
} from "@/components/ui/inputs";
import { Card, CardBody } from "@/components/ui/core";
import { cn } from "@/lib/cn";

export function FoodIntakeStep({
  onBack,
  onContinue,
}: {
  onBack: () => void;
  onContinue: () => void;
}) {
  const {
    profile,
    updateMeal,
    addFoodItem,
    updateFoodItem,
    removeFoodItem,
    setMealTiming,
    updateMealHabits,
    updateWaterIntake,
    updatePracticalConstraints,
    setAdditionalInformation,
  } = useProfile();

  const [showErrors, setShowErrors] = useState(false);
  const issues = useMemo(
    () => validateFoodIntake(profile.foodIntake),
    [profile.foodIntake],
  );

  const handleContinue = () => {
    if (issues.length > 0) {
      setShowErrors(true);
      const first = issues[0];
      const item = first.itemId;
      if (item) {
        document.getElementById(`${item}-${first.field}`)?.focus();
      }
      return;
    }
    onContinue();
  };

  /* ---------------------------- hydration --------------------------- */

  const water = profile.waterIntake;
  const waterDisplayValue =
    water.litresPerDay === null
      ? null
      : water.sourceUnit === "glasses"
        ? roundTo(water.litresPerDay / LITRES_PER_GLASS, 0)
        : water.litresPerDay;

  const handleWaterUnit = (unit: string) => {
    const patch: Partial<WaterIntake> = {
      sourceUnit: unit as WaterIntake["sourceUnit"],
    };
    // "Not sure" must never leave a stale number behind.
    if (unit === "unknown" || unit === "") patch.litresPerDay = null;
    updateWaterIntake(patch);
  };

  const handleWaterAmount = (value: number | null) => {
    if (value === null) {
      updateWaterIntake({ litresPerDay: null });
      return;
    }
    const litres =
      water.sourceUnit === "glasses" ? value * LITRES_PER_GLASS : value;
    updateWaterIntake({ litresPerDay: roundTo(litres, 2) });
  };

  const waterLimits =
    water.sourceUnit === "glasses" ? LIMITS.waterGlasses : LIMITS.waterLitres;
  const waterError =
    waterDisplayValue !== null &&
    (waterDisplayValue < waterLimits.min || waterDisplayValue > waterLimits.max)
      ? `Please enter a value between ${waterLimits.min} and ${waterLimits.max}, or choose “Not sure”.`
      : undefined;

  /* --------------------------- multi-select ------------------------- */

  const toggleAvailability = (id: string) => {
    const current = profile.practicalConstraints.foodAvailability;
    updatePracticalConstraints({
      foodAvailability: current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id],
    });
  };

  return (
    <PlannerSection
      stepLabel="Step 4 of 5 · Food Intake & Habits"
      title="Tell us about your eating habits"
      description="Understanding what you currently eat and when you eat helps us create a plan that fits your everyday routine. Approximate answers are perfectly fine."
      onBack={onBack}
      onContinue={handleContinue}
      continueLabel="Continue to Review"
      continueDisabled={showErrors && issues.length > 0}
      continueHint="Please fix the highlighted food entries to continue."
      aside={<FoodIntakeAside />}
    >
      <FoodSuggestions />

      {/* ------------------- 1. Current food intake ------------------- */}
      <SubSection
        icon={<Utensils className="h-4 w-4" aria-hidden="true" />}
        title="Your Current Food Intake"
        description="Add the foods you normally eat for each meal. Approximate portions are enough — you do not need perfectly measured quantities."
      >
        <div className="space-y-4">
          {MEALS.map((definition) => (
            <MealSection
              key={definition.id}
              definition={definition}
              meal={profile.foodIntake[definition.id]}
              issues={showErrors ? issues.filter((i) => i.mealId === definition.id) : []}
              onToggleSkip={(skipped) =>
                updateMeal(definition.id, { hasMeal: !skipped })
              }
              onAddItem={() => addFoodItem(definition.id)}
              onUpdateItem={(itemId, patch) =>
                updateFoodItem(definition.id, itemId, patch)
              }
              onRemoveItem={(itemId) => removeFoodItem(definition.id, itemId)}
              onNotesChange={(notes) => updateMeal(definition.id, { notes })}
            />
          ))}
        </div>
      </SubSection>

      {/* ---------------------- 2. Meal timings ----------------------- */}
      <SubSection
        icon={<Clock className="h-4 w-4" aria-hidden="true" />}
        title="Your Typical Meal Timings"
        description="Approximate timings are fine. Leave a meal blank if you do not usually have it."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MEALS.map((definition) => (
            <TimeField
              key={definition.id}
              id={`time-${definition.id}`}
              label={definition.label}
              value={profile.mealTimings[definition.id]}
              onChange={(value) => setMealTiming(definition.id, value)}
            />
          ))}
        </div>
      </SubSection>

      {/* ----------------------- 3. Meal habits ----------------------- */}
      <SubSection
        icon={<Repeat className="h-4 w-4" aria-hidden="true" />}
        title="Meal Habits"
        description="A few quick questions about your eating pattern. All optional."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField
            id="meals-per-day"
            label="Meals per day"
            placeholder="Prefer not to say"
            value={
              profile.mealHabits.mealsPerDay === null
                ? ""
                : String(profile.mealHabits.mealsPerDay)
            }
            onChange={(value) =>
              updateMealHabits({
                mealsPerDay: value === "" ? null : Number(value),
              })
            }
            options={MEALS_PER_DAY_OPTIONS.map((option) => ({
              value: option.id,
              label: option.label,
            }))}
          />
          <SelectField
            id="snacking-frequency"
            label="Snacking between meals"
            placeholder="Prefer not to say"
            value={profile.mealHabits.snackingFrequency}
            onChange={(value) =>
              updateMealHabits({
                snackingFrequency: value as MealHabits["snackingFrequency"],
              })
            }
            options={SNACKING_FREQUENCY_OPTIONS.map((option) => ({
              value: option.id,
              label: option.label,
            }))}
          />
          <SelectField
            id="late-night-eating"
            label="Eating late at night"
            placeholder="Prefer not to say"
            value={profile.mealHabits.lateNightEating}
            onChange={(value) =>
              updateMealHabits({
                lateNightEating: value as MealHabits["lateNightEating"],
              })
            }
            options={LATE_NIGHT_EATING_OPTIONS.map((option) => ({
              value: option.id,
              label: option.label,
            }))}
          />
        </div>
      </SubSection>

      {/* ------------------------ 4. Hydration ------------------------ */}
      <SubSection
        icon={<CupSoda className="h-4 w-4" aria-hidden="true" />}
        title="Daily Water Intake"
        description="An approximate value is enough. You can choose “Not sure” if you do not know."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="water-unit"
            label="How would you like to answer?"
            placeholder="Select…"
            value={water.sourceUnit}
            onChange={handleWaterUnit}
            options={WATER_UNIT_OPTIONS.map((option) => ({
              value: option.id,
              label: option.label,
            }))}
          />
          {water.sourceUnit !== "unknown" && water.sourceUnit !== "" && (
            <NumberField
              id="water-amount"
              label={
                water.sourceUnit === "glasses"
                  ? "Glasses per day"
                  : "Litres per day"
              }
              unit={water.sourceUnit === "glasses" ? "glasses" : "L"}
              placeholder={water.sourceUnit === "glasses" ? "8" : "2.5"}
              value={waterDisplayValue}
              onChange={handleWaterAmount}
              error={waterError}
            />
          )}
        </div>
        {water.sourceUnit === "glasses" && water.litresPerDay !== null && (
          <p className="mt-2 text-xs text-muted">
            Stored as <strong>{water.litresPerDay} L/day</strong> (one glass is
            counted as 250 ml).
          </p>
        )}
        {water.sourceUnit === "unknown" && (
          <p className="mt-2 text-xs text-muted">
            No value will be recorded — the application will not invent a
            number for you.
          </p>
        )}
      </SubSection>

      {/* ------------------ 5. Practical constraints ------------------ */}
      <SubSection
        icon={<ClipboardList className="h-4 w-4" aria-hidden="true" />}
        title="Food Availability & Practical Preferences"
        description="These answers help later stages suggest meals you can realistically prepare and find."
      >
        <div className="space-y-5">
          <TextAreaField
            id="daily-schedule"
            label="Typical daily schedule"
            hint="Optional"
            placeholder="Example: I leave for college at 8:00 AM and return around 5:00 PM."
            value={profile.practicalConstraints.typicalDailySchedule}
            onChange={(value) =>
              updatePracticalConstraints({ typicalDailySchedule: value })
            }
            rows={2}
            maxLength={300}
          />

          <fieldset>
            <legend className="text-sm font-semibold text-ink">
              What kind of meals are usually available to you?
            </legend>
            <p className="mt-1 text-xs text-muted">
              Optional — select all that apply.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {FOOD_AVAILABILITY_OPTIONS.map((option) => {
                const active =
                  profile.practicalConstraints.foodAvailability.includes(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleAvailability(option.id)}
                    className={cn(
                      "rounded-pill border px-3.5 py-1.5 text-sm font-medium transition-all duration-150",
                      active
                        ? "border-brand-500 bg-brand-50 text-brand-400 ring-1 ring-brand-500/30"
                        : "border-line bg-surface text-muted hover:border-brand-400/50 hover:text-ink",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              id="prep-time"
              label="Time you can spend preparing meals"
              placeholder="Prefer not to say"
              value={profile.practicalConstraints.mealPreparationTime}
              onChange={(value) =>
                updatePracticalConstraints({
                  mealPreparationTime:
                    value as PracticalConstraints["mealPreparationTime"],
                })
              }
              options={MEAL_PREP_TIME_OPTIONS.map((option) => ({
                value: option.id,
                label: option.label,
              }))}
            />
            <SelectField
              id="prep-preference"
              label="Meal preparation preference"
              placeholder="Prefer not to say"
              value={profile.practicalConstraints.mealPreparationPreference}
              onChange={(value) =>
                updatePracticalConstraints({
                  mealPreparationPreference:
                    value as PracticalConstraints["mealPreparationPreference"],
                })
              }
              options={MEAL_PREP_PREFERENCE_OPTIONS.map((option) => ({
                value: option.id,
                label: option.label,
              }))}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              id="weekend-difference"
              label="Do your eating habits change on weekends?"
              placeholder="Prefer not to say"
              value={profile.practicalConstraints.weekendDifference}
              onChange={(value) =>
                updatePracticalConstraints({
                  weekendDifference:
                    value as PracticalConstraints["weekendDifference"],
                })
              }
              options={WEEKEND_DIFFERENCE_OPTIONS.map((option) => ({
                value: option.id,
                label: option.label,
              }))}
            />
            {(profile.practicalConstraints.weekendDifference === "slightly" ||
              profile.practicalConstraints.weekendDifference ===
                "significantly") && (
              <TextAreaField
                id="weekend-notes"
                label="What changes on weekends?"
                hint="Optional"
                placeholder="Example: I eat out more often and skip breakfast."
                value={profile.practicalConstraints.weekendNotes}
                onChange={(value) =>
                  updatePracticalConstraints({ weekendNotes: value })
                }
                rows={2}
                maxLength={200}
              />
            )}
          </div>
        </div>
      </SubSection>

      {/* ------------------ 6. Additional information ----------------- */}
      <SubSection
        icon={<NotebookPen className="h-4 w-4" aria-hidden="true" />}
        title="Anything Else We Should Know?"
        description="Add practical information that could help make your future meal plan more realistic."
      >
        <TextAreaField
          id="additional-information"
          label="Additional information"
          hint="Optional"
          placeholder="Example: Busy college schedule, limited cooking access, prefer simple meals that can be packed."
          value={profile.additionalInformation}
          onChange={setAdditionalInformation}
          rows={4}
          maxLength={600}
        />
      </SubSection>
    </PlannerSection>
  );
}

/* ------------------------------------------------------------------ */
/* Layout helper                                                       */
/* ------------------------------------------------------------------ */

function SubSection({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-line pt-8 first:border-t-0 first:pt-0">
      <div className="mb-4 flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-brand-50 text-brand-400"
        >
          {icon}
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-bold text-ink">{title}</h3>
          {description && (
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {description}
            </p>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Aside                                                               */
/* ------------------------------------------------------------------ */

function FoodIntakeAside() {
  const { profile } = useProfile();

  const describedMeals = MEALS.filter((meal) => {
    const entry = profile.foodIntake[meal.id];
    return entry.hasMeal && entry.items.some((item) => item.name.trim());
  });
  const skippedMeals = MEALS.filter(
    (meal) => !profile.foodIntake[meal.id].hasMeal,
  );

  return (
    <Card>
      <CardBody>
        <div className="flex items-center gap-2 text-sm font-bold text-ink">
          <Info className="h-4 w-4 text-brand-400" aria-hidden="true" />
          Your eating pattern
        </div>

        <dl className="mt-4 space-y-2.5 text-xs">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">Meals described</dt>
            <dd className="font-bold text-ink">
              {describedMeals.length} of {MEALS.length}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">Marked as skipped</dt>
            <dd className="font-bold text-ink">{skippedMeals.length}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">Water intake</dt>
            <dd className="font-bold text-ink">
              {profile.waterIntake.litresPerDay !== null
                ? `${profile.waterIntake.litresPerDay} L/day`
                : "—"}
            </dd>
          </div>
        </dl>

        <p className="mt-4 rounded-[10px] bg-canvas p-3 text-xs leading-relaxed text-muted">
          Nothing here is judged as good or bad. Your current habits simply
          help later stages suggest a plan you can realistically follow.
        </p>
      </CardBody>
    </Card>
  );
}
