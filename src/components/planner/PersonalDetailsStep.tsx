"use client";

/**
 * Part 2 — Personal Details step (questionnaire step 1 of 5).
 *
 * Every field is bound directly to the central UserProfile via context,
 * so data survives navigation and edits. Validation lives in
 * lib/validation; this component decides when errors become visible
 * (on blur for touched fields, for all fields on Continue).
 */
import {
  Activity,
  Armchair,
  Flame,
  Footprints,
  Info,
  UserRound,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useProfile } from "@/context/ProfileContext";
import {
  ACTIVITY_LEVELS,
  GENDER_OPTIONS,
  labelFor,
  type Option,
} from "@/data/options";
import { validatePersonalDetails } from "@/lib/validation";
import type { ActivityLevel } from "@/types/profile";
import { NumberField, SelectField, TextField, TextAreaField } from "@/components/ui/inputs";
import { SelectableCard } from "@/components/ui/SelectableCard";
import { Card, CardBody, FieldError } from "@/components/ui/core";
import { PlannerSection } from "@/components/planner/PlannerSection";
import { cn } from "@/lib/cn";

const ACTIVITY_ICONS: Record<ActivityLevel, typeof Armchair> = {
  sedentary: Armchair,
  lightly_active: Footprints,
  moderately_active: Activity,
  very_active: Zap,
  extremely_active: Flame,
};

/** Field order used to focus the first invalid control. */
const FIELD_ORDER = [
  "fullName",
  "age",
  "gender",
  "heightCm",
  "weightKg",
  "activityLevel",
] as const;

type Touched = Partial<Record<(typeof FIELD_ORDER)[number], boolean>>;

export function PersonalDetailsStep({
  onBack,
  onContinue,
}: {
  onBack?: () => void;
  onContinue: () => void;
}) {
  const { profile, updatePersonalDetails } = useProfile();
  const pd = profile.personalDetails;

  const [touched, setTouched] = useState<Touched>({});
  const [showAll, setShowAll] = useState(false);

  const errors = useMemo(() => validatePersonalDetails(pd), [pd]);

  const visibleError = (
    field: (typeof FIELD_ORDER)[number],
  ): string | undefined => (touched[field] || showAll ? errors[field] : undefined);

  const markTouched = (field: keyof Touched) =>
    setTouched((current) => ({ ...current, [field]: true }));

  const handleContinue = () => {
    if (Object.keys(errors).length > 0) {
      setShowAll(true);
      const firstInvalid = FIELD_ORDER.find((field) => errors[field]);
      if (firstInvalid) {
        document.getElementById(`pd-${firstInvalid}`)?.focus();
      }
      return;
    }
    // Persist the trimmed name (numbers are already numeric).
    updatePersonalDetails({ fullName: pd.fullName.trim() });
    onContinue();
  };

  const activityOptions = ACTIVITY_LEVELS as Option<ActivityLevel>[];

  return (
    <PlannerSection
      stepLabel="Step 1 of 5 · Personal Details"
      title="Tell us a little about yourself"
      description="Basic information about you so we can understand your lifestyle and personalise your plan. Everything here feeds later nutrition calculations."
      onBack={onBack}
      onContinue={handleContinue}
      continueLabel="Continue to Nutrition"
      aside={<PersonalDetailsAside />}
    >
      {/* Full name */}
      <TextField
        id="pd-fullName"
        label="Full Name"
        placeholder="Enter your full name"
        value={pd.fullName}
        onChange={(value) => updatePersonalDetails({ fullName: value })}
        onBlur={() => markTouched("fullName")}
        error={visibleError("fullName")}
        required
        autoComplete="name"
        maxLength={80}
        icon={<UserRound className="h-4 w-4" aria-hidden="true" />}
      />

      {/* Age + gender */}
      <div className="grid gap-5 sm:grid-cols-2">
        <NumberField
          id="pd-age"
          label="Age"
          unit="years"
          placeholder="Enter your age"
          value={pd.age}
          onChange={(value) => updatePersonalDetails({ age: value })}
          onBlur={() => markTouched("age")}
          error={visibleError("age")}
          required
        />
        <SelectField
          id="pd-gender"
          label="Gender"
          placeholder="Select…"
          value={pd.gender}
          onChange={(value) => {
            updatePersonalDetails({ gender: value as typeof pd.gender });
            markTouched("gender");
          }}
          onBlur={() => markTouched("gender")}
          error={visibleError("gender")}
          required
          options={GENDER_OPTIONS.map((option) => ({
            value: option.id,
            label: option.label,
          }))}
        />
      </div>

      {/* Height + weight — canonical units: cm / kg */}
      <div className="grid gap-5 sm:grid-cols-2">
        <NumberField
          id="pd-heightCm"
          label="Height"
          unit="cm"
          placeholder="Enter your height"
          value={pd.heightCm}
          onChange={(value) => updatePersonalDetails({ heightCm: value })}
          onBlur={() => markTouched("heightCm")}
          error={visibleError("heightCm")}
          required
        />
        <NumberField
          id="pd-weightKg"
          label="Weight"
          unit="kg"
          placeholder="Enter your weight"
          value={pd.weightKg}
          onChange={(value) => updatePersonalDetails({ weightKg: value })}
          onBlur={() => markTouched("weightKg")}
          error={visibleError("weightKg")}
          required
        />
      </div>

      {/* Activity level — selectable cards */}
      <fieldset>
        <legend className="text-sm font-semibold text-ink">
          Activity Level
          <span className="ml-0.5 text-danger-500" aria-hidden="true">
            *
          </span>
        </legend>
        <p className="mt-1 text-xs text-muted">
          How active is a typical week for you?
        </p>
        <div
          role="radiogroup"
          aria-label="Activity level"
          className="mt-3 grid gap-3 sm:grid-cols-2"
        >
          {activityOptions.map((option) => {
            const Icon = ACTIVITY_ICONS[option.id];
            const selected = pd.activityLevel === option.id;
            return (
              <SelectableCard
                key={option.id}
                inputId={
                  option.id === activityOptions[0]?.id ? "pd-activityLevel" : undefined
                }
                name="activityLevel"
                value={option.id}
                mode="radio"
                selected={selected}
                onSelect={() => {
                  updatePersonalDetails({ activityLevel: option.id });
                  markTouched("activityLevel");
                }}
                title={option.label}
                description={option.description}
                icon={<Icon className="h-5 w-5" aria-hidden="true" />}
              />
            );
          })}
        </div>
        {(touched.activityLevel || showAll) && (
          <FieldError id="pd-activityLevel-error">
            {errors.activityLevel}
          </FieldError>
        )}
      </fieldset>

      {/* Occupation / lifestyle — optional */}
      <TextAreaField
        id="pd-occupation"
        label="Occupation / Lifestyle"
        placeholder="Example: Student, office worker, athlete, physically active job"
        hint="Optional"
        value={pd.occupationOrLifestyle}
        onChange={(value) =>
          updatePersonalDetails({ occupationOrLifestyle: value })
        }
        rows={2}
        maxLength={160}
      />
    </PlannerSection>
  );
}

/* ------------------------------------------------------------------ */
/* Aside — live summary + "why we ask" helper                          */
/* ------------------------------------------------------------------ */

function PersonalDetailsAside() {
  const { profile, completion } = useProfile();
  const pd = profile.personalDetails;

  if (!completion.personalComplete) {
    return (
      <Card>
        <CardBody>
          <div className="flex items-center gap-2 text-sm font-bold text-ink">
            <Info className="h-4 w-4 text-brand-400" aria-hidden="true" />
            Why we ask this
          </div>
          <ul className="mt-3 space-y-2.5 text-xs leading-relaxed text-muted">
            <li className="flex gap-2">
              <span className="font-bold text-brand-400">·</span>
              Height and weight are stored in centimetres and kilograms for
              your BMI and energy calculations.
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-brand-400">·</span>
              Age, gender and activity level inform future energy
              estimations.
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-brand-400">·</span>
              Occupation adds lifestyle context for later personalisation.
            </li>
          </ul>
        </CardBody>
      </Card>
    );
  }

  const rows: Array<[string, string]> = [
    ["Name", pd.fullName.trim()],
    ["Age", `${pd.age} years`],
    ["Gender", labelFor(GENDER_OPTIONS, pd.gender)],
    ["Height", `${pd.heightCm} cm`],
    ["Weight", `${pd.weightKg} kg`],
    ["Activity", labelFor(ACTIVITY_LEVELS, pd.activityLevel)],
  ];

  return (
    <Card className={cn("overflow-hidden")}>
      <div className="border-b border-line bg-brand-50/70 px-5 py-3.5">
        <p className="text-sm font-bold text-ink">Your information</p>
        <p className="text-xs text-muted">Updates as you type.</p>
      </div>
      <dl className="divide-y divide-line px-5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 py-2.5">
            <dt className="text-xs font-medium text-muted">{label}</dt>
            <dd className="text-right text-sm font-semibold text-ink">{value}</dd>
          </div>
        ))}
        {pd.occupationOrLifestyle.trim() && (
          <div className="py-2.5">
            <dt className="text-xs font-medium text-muted">Occupation</dt>
            <dd className="mt-0.5 text-sm font-semibold text-ink">
              {pd.occupationOrLifestyle.trim()}
            </dd>
          </div>
        )}
      </dl>
    </Card>
  );
}
