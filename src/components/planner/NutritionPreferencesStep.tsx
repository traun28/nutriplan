"use client";

/**
 * Part 3 — Nutrition & Preferences step (questionnaire steps 2–3 of 5).
 *
 * Collects: primary goal, dietary pattern, allergies, intolerances,
 * foods to avoid, preferred foods, preferred cuisines, optional
 * nutritional targets and free-text preference notes.
 *
 * Everything binds to the central UserProfile. Simple, deterministic
 * conflicts (allergy vs preference, diet vs preference, avoid vs
 * prefer) are detected with one-click resolution, and Continue stays
 * blocked until every conflict is resolved.
 */
import {
  AlertTriangle,
  Ban,
  Check,
  Drumstick,
  Dumbbell,
  Egg,
  Fish,
  Info,
  Leaf,
  Minus,
  Salad,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useProfile } from "@/context/ProfileContext";
import {
  COMMON_ALLERGENS,
  COMMON_INTOLERANCES,
  CUISINES,
  DIETARY_TYPES,
  GOALS,
} from "@/data/options";
import { validateNutritionAndPreferences } from "@/lib/validation";
import { detectConflicts } from "@/lib/conflicts";
import type { DietaryType, Goal } from "@/types/profile";
import { ChipInput } from "@/components/ui/Chip";
import { NumberField, TextAreaField, TextField } from "@/components/ui/inputs";
import { SelectableCard } from "@/components/ui/SelectableCard";
import { Card, CardBody, FieldError } from "@/components/ui/core";
import { PlannerSection } from "@/components/planner/PlannerSection";
import { cn } from "@/lib/cn";

const GOAL_ICONS: Record<Goal, typeof Target> = {
  weight_loss: TrendingDown,
  weight_maintenance: Minus,
  weight_gain: TrendingUp,
  muscle_gain: Dumbbell,
  general_health: Salad,
  improve_eating_habits: Sparkles,
};

const DIET_ICONS: Record<DietaryType, typeof Leaf> = {
  vegetarian: Salad,
  vegan: Leaf,
  non_vegetarian: Drumstick,
  eggetarian: Egg,
  pescatarian: Fish,
};

const FIELD_ORDER = [
  "primaryGoal",
  "dietaryType",
  "dailyCalorieTarget",
  "proteinTargetGrams",
] as const;

type FieldName = (typeof FIELD_ORDER)[number];
type Touched = Partial<Record<FieldName, boolean>>;

export function NutritionPreferencesStep({
  onBack,
  onContinue,
}: {
  onBack: () => void;
  onContinue: () => void;
}) {
  const {
    profile,
    updateNutrition,
    updateDietary,
    setAllergies,
    setIntolerances,
    setPreferredFoods,
    setFoodsToAvoid,
    removePreferredFood,
    removeFoodToAvoid,
  } = useProfile();

  const nutrition = profile.nutritionalInformation;
  const dietary = profile.dietaryPreferences;

  const [touched, setTouched] = useState<Touched>({});
  const [showAll, setShowAll] = useState(false);

  const errors = useMemo(
    () => validateNutritionAndPreferences(nutrition, dietary),
    [nutrition, dietary],
  );
  const conflicts = useMemo(() => detectConflicts(profile), [profile]);

  const visibleError = (field: FieldName): string | undefined =>
    touched[field] || showAll ? errors[field] : undefined;

  const markTouched = (field: FieldName) =>
    setTouched((current) => ({ ...current, [field]: true }));

  const handleContinue = () => {
    if (Object.keys(errors).length > 0) {
      setShowAll(true);
      const firstInvalid = FIELD_ORDER.find((field) => errors[field]);
      if (firstInvalid) {
        document.getElementById(`np-${firstInvalid}`)?.focus();
      }
      return;
    }
    onContinue();
  };

  /* ------------------------------ allergies ------------------------------ */

  const hasNoAllergies = profile.allergies.includes("none");
  const otherAllergyEntry = profile.allergies.find((entry) =>
    entry.startsWith("other:"),
  );
  const [otherAllergyOpen, setOtherAllergyOpen] = useState(
    otherAllergyEntry !== undefined,
  );
  const [otherAllergyDraft, setOtherAllergyDraft] = useState(
    otherAllergyEntry?.slice(6) ?? "",
  );

  const toggleAllergen = (id: string, checked: boolean) => {
    if (id === "none") {
      setAllergies(checked ? ["none"] : profile.allergies.filter((a) => a !== "none"));
      return;
    }
    const base = profile.allergies.filter((a) => a !== "none" && a !== id);
    setAllergies(checked ? [...base, id] : base);
  };

  const toggleOtherAllergy = (checked: boolean) => {
    setOtherAllergyOpen(checked);
    if (!checked) {
      setOtherAllergyDraft("");
      setAllergies(profile.allergies.filter((a) => !a.startsWith("other:")));
    }
  };

  const updateOtherAllergy = (text: string) => {
    setOtherAllergyDraft(text);
    const clean = text.trim().toLowerCase();
    const base = profile.allergies.filter((a) => !a.startsWith("other:"));
    setAllergies(clean ? [...base, `other:${clean}`] : base);
  };

  /* ---------------------------- intolerances ---------------------------- */

  const otherIntoleranceEntry = profile.intolerances.find((entry) =>
    entry.startsWith("other:"),
  );
  const [otherIntoleranceOpen, setOtherIntoleranceOpen] = useState(
    otherIntoleranceEntry !== undefined,
  );
  const [otherIntoleranceDraft, setOtherIntoleranceDraft] = useState(
    otherIntoleranceEntry?.slice(6) ?? "",
  );

  const toggleIntolerance = (id: string, checked: boolean) => {
    const base = profile.intolerances.filter(
      (entry) => entry !== id && !entry.startsWith("other:"),
    );
    setIntolerances(checked ? [...base, id] : base);
  };

  const toggleOtherIntolerance = (checked: boolean) => {
    setOtherIntoleranceOpen(checked);
    if (!checked) {
      setOtherIntoleranceDraft("");
      setIntolerances(profile.intolerances.filter((a) => !a.startsWith("other:")));
    }
  };

  const updateOtherIntolerance = (text: string) => {
    setOtherIntoleranceDraft(text);
    const clean = text.trim().toLowerCase();
    const base = profile.intolerances.filter((a) => !a.startsWith("other:"));
    setIntolerances(clean ? [...base, `other:${clean}`] : base);
  };

  /* ------------------------------- cuisines ----------------------------- */

  const toggleCuisine = (id: string) => {
    const current = dietary.preferredCuisines;
    updateDietary({
      preferredCuisines: current.includes(id)
        ? current.filter((c) => c !== id)
        : [...current, id],
    });
  };

  return (
    <PlannerSection
      stepLabel="Steps 2–3 of 5 · Nutrition & Preferences"
      title="Tell us about your goals and the foods that work best for you"
      description="Your goals, food preferences and dietary requirements help us create a plan that fits your lifestyle. Only your goal and dietary pattern are required — everything else is optional."
      onBack={onBack}
      onContinue={handleContinue}
      continueLabel="Continue to Food Intake"
      continueDisabled={conflicts.length > 0}
      continueHint="Resolve the conflicts below to continue."
      aside={<NutritionAside />}
    >
      {/* ------------------------- A. Primary goal ------------------------ */}
      <SubSection
        letter="A"
        title="Your Main Goal"
        description="What would you like this plan to support?"
      >
        <fieldset>
          <legend className="sr-only">Primary goal</legend>
          <div role="radiogroup" aria-label="Primary goal" className="grid gap-3 sm:grid-cols-2">
            {GOALS.map((goal, index) => {
              const Icon = GOAL_ICONS[goal.id as Goal];
              return (
                <SelectableCard
                  key={goal.id}
                  inputId={index === 0 ? "np-primaryGoal" : undefined}
                  name="primaryGoal"
                  value={goal.id}
                  mode="radio"
                  selected={nutrition.primaryGoal === goal.id}
                  onSelect={() => {
                    updateNutrition({ primaryGoal: goal.id as Goal });
                    markTouched("primaryGoal");
                  }}
                  title={goal.label}
                  description={goal.description}
                  icon={<Icon className="h-5 w-5" aria-hidden="true" />}
                />
              );
            })}
          </div>
          <FieldError id="np-primaryGoal-error">
            {visibleError("primaryGoal")}
          </FieldError>
        </fieldset>
      </SubSection>

      {/* ----------------------- B. Dietary pattern ----------------------- */}
      <SubSection
        letter="B"
        title="Dietary Pattern"
        description="The eating style your plan should follow."
      >
        <fieldset>
          <legend className="sr-only">Dietary pattern</legend>
          <div role="radiogroup" aria-label="Dietary pattern" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {DIETARY_TYPES.map((diet, index) => {
              const Icon = DIET_ICONS[diet.id as DietaryType];
              return (
                <SelectableCard
                  key={diet.id}
                  inputId={index === 0 ? "np-dietaryType" : undefined}
                  name="dietaryType"
                  value={diet.id}
                  mode="radio"
                  selected={dietary.dietaryType === diet.id}
                  onSelect={() => {
                    updateDietary({ dietaryType: diet.id as DietaryType });
                    markTouched("dietaryType");
                  }}
                  title={diet.label}
                  description={diet.description}
                  icon={<Icon className="h-5 w-5" aria-hidden="true" />}
                />
              );
            })}
          </div>
          <FieldError id="np-dietaryType-error">
            {visibleError("dietaryType")}
          </FieldError>
        </fieldset>
      </SubSection>

      {/* --------------------------- C. Allergies ------------------------- */}
      <SubSection
        letter="C"
        title="Food Allergies"
        description="Select any foods or ingredients you are allergic to. These will be excluded from future recommendations."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {COMMON_ALLERGENS.map((allergen) => (
            <SelectableCard
              key={allergen.id}
              name="allergies"
              value={allergen.id}
              mode="checkbox"
              selected={profile.allergies.includes(allergen.id)}
              onSelect={(checked) => toggleAllergen(allergen.id, checked)}
              title={allergen.label}
            />
          ))}

          <SelectableCard
            name="allergies"
            value="none"
            mode="checkbox"
            selected={hasNoAllergies}
            onSelect={(checked) => toggleAllergen("none", checked)}
            title="No known food allergies"
            description="Select this if you have no food allergies."
            icon={<Ban className="h-5 w-5" aria-hidden="true" />}
          />

          <SelectableCard
            name="allergies"
            value="other"
            mode="checkbox"
            selected={otherAllergyOpen}
            onSelect={toggleOtherAllergy}
            title="Other"
            description="Specify an allergy not in the list."
          />
        </div>

        {otherAllergyOpen && (
          <div className="mt-3">
            <TextField
              id="np-other-allergy"
              label="Other allergy (specify)"
              placeholder="Example: cashew-related ingredient"
              value={otherAllergyDraft}
              onChange={updateOtherAllergy}
              maxLength={60}
            />
          </div>
        )}

        <div className="mt-4 flex gap-2.5 rounded-[10px] border border-accent-300/40/60 bg-accent-200/30 p-3.5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent-300" aria-hidden="true" />
          <p className="text-xs leading-relaxed text-ink/80">
            Declared allergies will be treated as strict exclusions when your
            future meal plan is generated. Allergies always take priority over
            food preferences.
          </p>
        </div>
      </SubSection>

      {/* -------------------------- D. Intolerances ----------------------- */}
      <SubSection
        letter="D"
        title="Food Intolerances"
        description="Foods you prefer to avoid because they do not suit you. Intolerances are different from allergies and are kept separate."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {COMMON_INTOLERANCES.map((intolerance) => (
            <SelectableCard
              key={intolerance.id}
              name="intolerances"
              value={intolerance.id}
              mode="checkbox"
              selected={profile.intolerances.includes(intolerance.id)}
              onSelect={(checked) => toggleIntolerance(intolerance.id, checked)}
              title={intolerance.label}
            />
          ))}
          <SelectableCard
            name="intolerances"
            value="other"
            mode="checkbox"
            selected={otherIntoleranceOpen}
            onSelect={toggleOtherIntolerance}
            title="Other"
            description="Specify an intolerance not in the list."
          />
        </div>

        {otherIntoleranceOpen && (
          <div className="mt-3">
            <TextField
              id="np-other-intolerance"
              label="Other intolerance (specify)"
              placeholder="Example: onions"
              value={otherIntoleranceDraft}
              onChange={updateOtherIntolerance}
              maxLength={60}
            />
          </div>
        )}
      </SubSection>

      {/* ------------------------- E. Foods to avoid ---------------------- */}
      <SubSection
        letter="E"
        title="Foods to Avoid"
        description="Specific foods you do not want in your meal plan. Duplicates are ignored."
      >
        <ChipInput
          id="np-foods-to-avoid"
          values={profile.foodsToAvoid}
          onChange={setFoodsToAvoid}
          placeholder="Enter a food"
          suggestions={[]}
        />
      </SubSection>

      {/* ------------------------- F. Preferred foods --------------------- */}
      <SubSection
        letter="F"
        title="Preferred Foods"
        description="Foods you enjoy and would like included when possible."
      >
        <ChipInput
          id="np-preferred-foods"
          values={profile.preferredFoods}
          onChange={setPreferredFoods}
          placeholder="Enter a food"
          suggestions={[]}
        />
      </SubSection>

      {/* ------------------------- G. Preferred cuisine ------------------- */}
      <SubSection
        letter="G"
        title="Preferred Cuisine"
        description="Optional — pick any cuisines you enjoy."
      >
        <div className="flex flex-wrap gap-2">
          {CUISINES.map((cuisine) => {
            const active = dietary.preferredCuisines.includes(cuisine.id);
            return (
              <button
                key={cuisine.id}
                type="button"
                aria-pressed={active}
                onClick={() => toggleCuisine(cuisine.id)}
                className={cn(
                  "rounded-pill border px-3.5 py-1.5 text-sm font-medium transition-all duration-150",
                  active
                    ? "border-brand-500 bg-brand-50 text-brand-300 ring-1 ring-brand-500/30"
                    : "border-line bg-surface text-muted hover:border-brand-400/50 hover:text-ink",
                )}
              >
                {cuisine.label}
              </button>
            );
          })}
        </div>
      </SubSection>

      {/* --------------------- H. Optional nutrition targets --------------- */}
      <SubSection
        letter="H"
        title="Optional Nutritional Targets"
        description="Leave blank if you do not know your targets — they can be estimated in a later part."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <NumberField
            id="np-calories"
            label="Daily Calorie Target"
            unit="kcal"
            placeholder="Leave blank if unsure"
            value={nutrition.dailyCalorieTarget}
            onChange={(value) => updateNutrition({ dailyCalorieTarget: value })}
            onBlur={() => markTouched("dailyCalorieTarget")}
            error={visibleError("dailyCalorieTarget")}
          />
          <NumberField
            id="np-protein"
            label="Daily Protein Target"
            unit="g/day"
            placeholder="Leave blank if unsure"
            value={nutrition.proteinTargetGrams}
            onChange={(value) => updateNutrition({ proteinTargetGrams: value })}
            onBlur={() => markTouched("proteinTargetGrams")}
            error={visibleError("proteinTargetGrams")}
          />
        </div>
        <div className="mt-4 flex gap-2.5 rounded-[10px] border border-line bg-canvas p-3.5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" aria-hidden="true" />
          <p className="text-xs leading-relaxed text-muted">
            Already have a nutrition target from a qualified professional?
            Enter it here. Otherwise, leave these values blank — a suitable
            target can be calculated from your profile later.
          </p>
        </div>
      </SubSection>

      {/* ------------------- I. Additional preference notes ---------------- */}
      <SubSection
        letter="I"
        title="Anything Else About Your Food Preferences"
        description="Optional — capture anything the questions above missed."
      >
        <TextAreaField
          id="np-notes"
          label="Food preference notes"
          placeholder="Example: I prefer simple homemade meals, rice-based lunches and light dinners."
          value={dietary.foodPreferenceNotes}
          onChange={(value) => updateDietary({ foodPreferenceNotes: value })}
          rows={3}
          maxLength={400}
        />
      </SubSection>

      {/* ---------------------------- Conflicts --------------------------- */}
      {conflicts.length > 0 && (
        <div
          role="alert"
          className="rounded-card border border-danger-500/30 bg-danger-50/70 p-5"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-danger-600" aria-hidden="true" />
            <h3 className="text-sm font-bold text-danger-700">
              {conflicts.length === 1
                ? "We found a conflict"
                : `We found ${conflicts.length} conflicts`}
            </h3>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-danger-700/80">
            Allergies and restrictions always take priority over preferences.
            Resolve each conflict to continue — your selections are never
            deleted silently.
          </p>
          <ul className="mt-4 space-y-3">
            {conflicts.map((conflict) => (
              <li
                key={conflict.id}
                className="flex flex-col gap-3 rounded-[10px] border border-danger-500/30 bg-surface p-3.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <p className="text-sm leading-relaxed text-ink">
                  {conflict.message}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (conflict.resolution.field === "preferredFoods") {
                      removePreferredFood(conflict.resolution.value);
                    } else {
                      removeFoodToAvoid(conflict.resolution.value);
                    }
                  }}
                  className="shrink-0 rounded-pill border border-danger-200 bg-surface px-3.5 py-1.5 text-xs font-semibold text-danger-700 transition-colors hover:bg-danger-50"
                >
                  {conflict.resolution.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </PlannerSection>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-section layout helper                                           */
/* ------------------------------------------------------------------ */

function SubSection({
  letter,
  title,
  description,
  children,
}: {
  letter: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-line pt-8 first:border-t-0 first:pt-0">
      <div className="grid gap-4 md:grid-cols-[210px_1fr]">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-400">
            Section {letter}
          </p>
          <h3 className="mt-1.5 text-base font-bold text-ink">{title}</h3>
          {description && (
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {description}
            </p>
          )}
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Aside — progress towards the generated plan                         */
/* ------------------------------------------------------------------ */

function NutritionAside() {
  const { profile, completion } = useProfile();

  const checkpoints = [
    { label: "Personal details", done: completion.personalComplete },
    { label: "Nutrition & preferences", done: completion.nutritionComplete },
    { label: "Food intake & habits", done: completion.foodIntakeComplete },
  ];

  return (
    <Card>
      <CardBody>
        <p className="text-sm font-bold text-ink">Plan progress</p>
        <p className="mt-1 text-xs text-muted">
          Complete these sections, then save to unlock your plan.
        </p>
        <ul className="mt-4 space-y-2.5">
          {checkpoints.map((checkpoint) => (
            <li key={checkpoint.label} className="flex items-center gap-2.5">
              <span
                className={cn(
                  "grid h-5 w-5 shrink-0 place-items-center rounded-full border",
                  checkpoint.done
                    ? "border-brand-600 bg-brand-700 text-white"
                    : "border-line bg-surface text-muted",
                )}
              >
                {checkpoint.done ? (
                  <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-line" aria-hidden="true" />
                )}
              </span>
              <span
                className={cn(
                  "text-xs font-medium",
                  checkpoint.done ? "text-ink" : "text-muted",
                )}
              >
                {checkpoint.label}
              </span>
            </li>
          ))}
        </ul>

        {completion.nutritionComplete && (
          <div className="mt-4 rounded-[10px] bg-brand-50 p-3 text-xs leading-relaxed text-brand-300">
            Goal: <strong>{GOALS.find((g) => g.id === profile.nutritionalInformation.primaryGoal)?.label}</strong>
            {" · "}Diet: <strong>{DIETARY_TYPES.find((d) => d.id === profile.dietaryPreferences.dietaryType)?.label}</strong>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
