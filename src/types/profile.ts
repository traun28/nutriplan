/**
 * Central data model for the Personalised Diet Planner.
 *
 * Part 2 populates `personalDetails`.
 * Part 3 populates `nutritionalInformation`, `dietaryPreferences`,
 * `allergies`, `intolerances`, `preferredFoods` and `foodsToAvoid`.
 * Part 4 populates `foodIntake`, `mealTimings`, `mealHabits`,
 * `waterIntake`, `practicalConstraints` and `additionalInformation`.
 * Part 5 adds the storage metadata (`profileVersion`, `profileId`,
 * `createdAt`, `updatedAt`).
 * Part 6 derives a separate `ProcessedProfile` — it never mutates this one.
 *
 * Keep this structure stable and JSON-serialisable: the storage (Part 5),
 * processing (Part 6) and generation (Part 7) layers all read from it.
 */

/* ------------------------------------------------------------------ */
/* Enumerations (machine-readable values — UI labels live in data/)    */
/* ------------------------------------------------------------------ */

export type Gender = "male" | "female" | "other" | "prefer_not_to_say";

export type ActivityLevel =
  | "sedentary"
  | "lightly_active"
  | "moderately_active"
  | "very_active"
  | "extremely_active";

export type Goal =
  | "weight_loss"
  | "weight_maintenance"
  | "weight_gain"
  | "muscle_gain"
  | "general_health"
  | "improve_eating_habits";

export type DietaryType =
  | "vegetarian"
  | "vegan"
  | "non_vegetarian"
  | "eggetarian"
  | "pescatarian";

/** The six meal slots used across food intake and meal timings. */
export type MealId =
  | "breakfast"
  | "morningSnack"
  | "lunch"
  | "eveningSnack"
  | "dinner"
  | "otherSnacks";

export const MEAL_IDS: MealId[] = [
  "breakfast",
  "morningSnack",
  "lunch",
  "eveningSnack",
  "dinner",
  "otherSnacks",
];

export type SnackingFrequency =
  | ""
  | "rarely"
  | "occasionally"
  | "often"
  | "very_often";

export type LateNightEating = "" | "never" | "occasionally" | "often";

export type MealPreparationTime =
  | ""
  | "very_little"
  | "ten_to_twenty"
  | "twenty_to_forty"
  | "more_than_forty";

export type MealPreparationPreference = "" | "homemade" | "ready_to_eat" | "mixed";

export type WeekendDifference = "" | "no" | "slightly" | "significantly";

/** How the user expressed their water intake before conversion to litres. */
export type WaterSourceUnit = "" | "litres" | "glasses" | "unknown";

/* ------------------------------------------------------------------ */
/* Profile sections                                                    */
/* ------------------------------------------------------------------ */

/** Part 2 — personal details used by the Part 6 BMI / energy engine. */
export interface PersonalDetails {
  fullName: string;
  age: number | null;
  gender: Gender | "";
  /** Canonical unit: centimetres. */
  heightCm: number | null;
  /** Canonical unit: kilograms. */
  weightKg: number | null;
  activityLevel: ActivityLevel | "";
  occupationOrLifestyle: string;
}

/** Part 3 — goals and optional self-declared nutritional targets. */
export interface NutritionalInformation {
  primaryGoal: Goal | "";
  /** kcal/day, null = "let the application estimate it later". */
  dailyCalorieTarget: number | null;
  /** g/day, null = "no target declared". */
  proteinTargetGrams: number | null;
}

/** Part 3 — dietary pattern and taste preferences. */
export interface DietaryPreferences {
  dietaryType: DietaryType | "";
  preferredCuisines: string[];
  foodPreferenceNotes: string;
}

/* ------------------------------ Part 4 ----------------------------- */

/**
 * One food entry inside a meal.
 * Quantity and unit are stored separately so Part 7 can match and scale
 * portions — never as a single "3 idlis" string.
 */
export interface FoodItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: string;
  notes: string;
}

/**
 * One meal slot. `hasMeal: false` is an explicit "I usually skip this
 * meal" statement — it is never inferred from an empty item list.
 */
export interface MealEntry {
  hasMeal: boolean;
  items: FoodItem[];
  notes: string;
}

export type FoodIntake = Record<MealId, MealEntry>;

/** Times in 24-hour "HH:MM" format; "" means "not specified". */
export type MealTimings = Record<MealId, string>;

export interface MealHabits {
  /** 2–6, or 7 meaning "more than 6". null = not specified. */
  mealsPerDay: number | null;
  snackingFrequency: SnackingFrequency;
  lateNightEating: LateNightEating;
}

/**
 * Hydration. `litresPerDay` is the canonical value; `sourceUnit` records
 * how the user expressed it (glasses are converted at 250 ml per glass).
 */
export interface WaterIntake {
  litresPerDay: number | null;
  sourceUnit: WaterSourceUnit;
}

/** Practical meal-planning constraints (distinct from Part 2 occupation). */
export interface PracticalConstraints {
  typicalDailySchedule: string;
  foodAvailability: string[];
  mealPreparationTime: MealPreparationTime;
  mealPreparationPreference: MealPreparationPreference;
  weekendDifference: WeekendDifference;
  weekendNotes: string;
}

/* ------------------------------------------------------------------ */
/* Aggregate user profile (the single source of truth)                 */
/* ------------------------------------------------------------------ */

/** Bumped whenever the persisted shape changes (Part 5 migrations). */
export const CURRENT_PROFILE_VERSION = 1;

export interface UserProfile {
  profileVersion: number;
  /** Stable id assigned on first save; "" until then. */
  profileId: string;
  /** ISO timestamps; null until the profile is first saved. */
  createdAt: string | null;
  updatedAt: string | null;

  personalDetails: PersonalDetails;
  nutritionalInformation: NutritionalInformation;
  dietaryPreferences: DietaryPreferences;
  /**
   * Allergen ids from COMMON_ALLERGENS, plus:
   * - "none"                 → user declared no known food allergies
   * - "other:<free text>"    → custom allergy not in the predefined list
   */
  allergies: string[];
  /** Intolerance ids from COMMON_INTOLERANCES, plus "other:<free text>". */
  intolerances: string[];
  /** Normalised lowercase food names. */
  preferredFoods: string[];
  foodsToAvoid: string[];
  foodIntake: FoodIntake;
  mealTimings: MealTimings;
  mealHabits: MealHabits;
  waterIntake: WaterIntake;
  practicalConstraints: PracticalConstraints;
  additionalInformation: string;
}

function createEmptyMeal(hasMeal: boolean): MealEntry {
  return { hasMeal, items: [], notes: "" };
}

/** Safe empty food intake — every meal slot always exists. */
export function createEmptyFoodIntake(): FoodIntake {
  return {
    breakfast: createEmptyMeal(true),
    morningSnack: createEmptyMeal(true),
    lunch: createEmptyMeal(true),
    eveningSnack: createEmptyMeal(true),
    dinner: createEmptyMeal(true),
    otherSnacks: createEmptyMeal(false),
  };
}

export function createEmptyMealTimings(): MealTimings {
  return {
    breakfast: "",
    morningSnack: "",
    lunch: "",
    eveningSnack: "",
    dinner: "",
    otherSnacks: "",
  };
}

/**
 * Safe empty profile — the single default-profile factory used by the
 * context, the storage rehydration layer and the tests.
 */
export function createEmptyProfile(): UserProfile {
  return {
    profileVersion: CURRENT_PROFILE_VERSION,
    profileId: "",
    createdAt: null,
    updatedAt: null,
    personalDetails: {
      fullName: "",
      age: null,
      gender: "",
      heightCm: null,
      weightKg: null,
      activityLevel: "",
      occupationOrLifestyle: "",
    },
    nutritionalInformation: {
      primaryGoal: "",
      dailyCalorieTarget: null,
      proteinTargetGrams: null,
    },
    dietaryPreferences: {
      dietaryType: "",
      preferredCuisines: [],
      foodPreferenceNotes: "",
    },
    allergies: [],
    intolerances: [],
    preferredFoods: [],
    foodsToAvoid: [],
    foodIntake: createEmptyFoodIntake(),
    mealTimings: createEmptyMealTimings(),
    mealHabits: {
      mealsPerDay: null,
      snackingFrequency: "",
      lateNightEating: "",
    },
    waterIntake: { litresPerDay: null, sourceUnit: "" },
    practicalConstraints: {
      typicalDailySchedule: "",
      foodAvailability: [],
      mealPreparationTime: "",
      mealPreparationPreference: "",
      weekendDifference: "",
      weekendNotes: "",
    },
    additionalInformation: "",
  };
}

/* ------------------------------------------------------------------ */
/* Part 6 — processed nutritional profile (derived, never the source)  */
/* ------------------------------------------------------------------ */

export type BmiCategory = "underweight" | "normal" | "overweight" | "obesity";

export interface BmiResult {
  /** Rounded to one decimal for display; still a number. */
  value: number;
  category: BmiCategory;
  categoryLabel: string;
}

export type TargetSource = "user" | "calculated" | "unavailable";

/** Which variant of the Mifflin-St Jeor constant was used. */
export type EnergyFormula =
  | "mifflin_st_jeor_male"
  | "mifflin_st_jeor_female"
  | "mifflin_st_jeor_neutral";

export interface EnergyResult {
  restingEstimateCalories: number | null;
  maintenanceEstimateCalories: number | null;
  calculatedGoalCalories: number | null;
  userProvidedCalories: number | null;
  selectedCalories: number | null;
  selectedSource: TargetSource;
  formula: EnergyFormula | null;
  activityFactor: number | null;
  /** Fractional goal adjustment actually applied, e.g. -0.15. */
  goalAdjustment: number | null;
}

export interface ProteinResult {
  estimatedGrams: number | null;
  userProvidedGrams: number | null;
  selectedGrams: number | null;
  selectedSource: TargetSource;
  /** g per kg of body weight used for the estimate. */
  gramsPerKg: number | null;
}

export interface MacronutrientResult {
  protein: ProteinResult;
  carbohydrates: { grams: number | null; percentOfCalories: number | null };
  fat: { grams: number | null; percentOfCalories: number | null };
  /** Sum of macro calories — used to verify internal consistency. */
  totalMacroCalories: number | null;
}

export interface LabelledValue {
  id: string;
  label: string;
}

export interface ProcessedProfile {
  /** Links the result back to the exact profile revision it came from. */
  sourceProfileId: string;
  sourceProfileUpdatedAt: string | null;
  processedAt: string;
  status: "complete" | "partial";
  bmi: BmiResult | null;
  energy: EnergyResult;
  macronutrients: MacronutrientResult;
  goal: LabelledValue | null;
  activity: LabelledValue | null;
  /** Human-readable notes about assumptions and fallbacks applied. */
  calculationNotes: string[];
}

/** A single blocking or informational issue raised by the processor. */
export interface ProcessingIssue {
  field: string;
  message: string;
}

export interface ProcessingResult {
  success: boolean;
  processed: ProcessedProfile;
  errors: ProcessingIssue[];
}

/* ------------------------------------------------------------------ */
/* Part 7 — food database schema                                       */
/* ------------------------------------------------------------------ */

/** Which slot(s) of the day a food item is appropriate for. */
export type FoodCategory =
  | "breakfast"
  | "morning_snack"
  | "lunch"
  | "evening_snack"
  | "dinner"
  | "beverage";

export type MealComplexity = "very_easy" | "easy" | "moderate" | "advanced";

/** Reference portion the nutrition values below describe. */
export interface ServingSize {
  quantity: number;
  /** Unit id from FOOD_UNITS (piece, bowl, cup, grams, ml …). */
  unit: string;
}

/**
 * One entry in the local food dataset.
 *
 * Nutrition values are APPROXIMATE reference figures chosen for an
 * educational project; real values vary by recipe, brand, portion and
 * cooking method. See `src/data/foods/README` notes in foodDatabase.ts.
 */
export interface FoodItemRecord {
  /** Stable machine id, e.g. "bf_veg_oats_bowl". Names may change; ids do not. */
  id: string;
  name: string;
  category: FoodCategory;
  /** Additional slots this item also suits (e.g. a snack that works at both). */
  alsoSuitableFor?: FoodCategory[];
  /** Dietary patterns this item is compatible with. */
  dietaryTypes: DietaryType[];
  /** Nutrition for exactly one `servingSize`. */
  calories: number;
  proteinGrams: number;
  carbohydrateGrams: number;
  fatGrams: number;
  servingSize: ServingSize;
  /** Normalised lowercase ingredient names — used for conflict detection. */
  ingredients: string[];
  /** Allergen ids from COMMON_ALLERGENS present in this item. */
  allergens: string[];
  /** Intolerance ids from COMMON_INTOLERANCES this item conflicts with. */
  intoleranceFlags: string[];
  tags: string[];
  /** Cuisine ids from CUISINES. */
  cuisines: string[];
  preparationTimeMinutes: number;
  complexity: MealComplexity;
  /** Smallest / largest portion multiplier that stays realistic. */
  minServings: number;
  maxServings: number;
}

/* ------------------------------------------------------------------ */
/* Part 7 — generated diet plan                                        */
/* ------------------------------------------------------------------ */

export const CURRENT_DIET_PLAN_VERSION = 1;

/** One food line inside a generated meal, with its scaled contribution. */
export interface PlannedFoodItem {
  foodId: string;
  name: string;
  servings: number;
  /** Human-readable portion, e.g. "1.5 bowl(s)". */
  portionLabel: string;
  calories: number;
  proteinGrams: number;
  carbohydrateGrams: number;
  fatGrams: number;
  ingredients: string[];
  preparationTimeMinutes: number;
}

export interface PlannedMeal {
  id: string;
  /** Meal slot id shared with foodIntake / mealTimings. */
  type: MealId;
  label: string;
  name: string;
  /** "HH:MM" — from the user's timings when available, else a default. */
  time: string;
  items: PlannedFoodItem[];
  calories: number;
  proteinGrams: number;
  carbohydrateGrams: number;
  fatGrams: number;
  preparationTimeMinutes: number;
  notes: string;
  /** Share of the daily calorie target this slot was planned around. */
  targetShare: number;
}

export interface NutritionTotals {
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
}

export interface DietPlanSummary {
  goal: LabelledValue | null;
  dietaryType: LabelledValue | null;
  targetCalories: number;
  targetProtein: number;
  targetCarbohydrates: number;
  targetFat: number;
}

export type PlanCheckOutcome = "passed" | "failed" | "not_applicable";

/** Per-category safety report shown as the plan's restriction summary. */
export interface PlanCheckReport {
  allergies: PlanCheckOutcome;
  intolerances: PlanCheckOutcome;
  dietaryType: PlanCheckOutcome;
  foodsToAvoid: PlanCheckOutcome;
  mealStructure: PlanCheckOutcome;
  nutrition: PlanCheckOutcome;
}

export interface PlanValidation {
  isValid: boolean;
  /** Blocking problems — a plan with these is never shown as current. */
  errors: string[];
  /** Non-blocking observations, e.g. "protein slightly below target". */
  warnings: string[];
  checks: PlanCheckReport;
  /** How many generation attempts were needed to reach a valid plan. */
  attempts: number;
}

export interface DietPlan {
  id: string;
  dietPlanVersion: number;
  generatedAt: string;
  sourceProfileId: string;
  sourceProfileUpdatedAt: string | null;
  /** Links the plan to the exact processed targets it was built against. */
  processedAt: string;
  /** Seed used for controlled variation, so regeneration differs. */
  variationSeed: number;
  summary: DietPlanSummary;
  meals: PlannedMeal[];
  dailyTotals: NutritionTotals;
  /** Dynamic, profile-derived reasons this plan is personalised. */
  personalisationFactors: string[];
  recommendations: string[];
  validation: PlanValidation;
}

export type GenerationFailureReason =
  | "PROFILE_INCOMPLETE"
  | "TARGETS_UNAVAILABLE"
  | "INSUFFICIENT_OPTIONS"
  | "VALIDATION_FAILED";

export type GenerationResult =
  | { success: true; plan: DietPlan }
  | {
      success: false;
      reason: GenerationFailureReason;
      message: string;
      details: string[];
      /** Foods that caused a safety failure, so a retry can exclude them. */
      offendingFoodIds: string[];
    };

export interface GenerationOptions {
  /** Deterministic variation control; omit for a time-based seed. */
  variationSeed?: number;
  /** Food ids to skip this round (used by "Regenerate"). */
  excludeFoodIds?: string[];
}
