/**
 * Static option catalogue for the questionnaire.
 *
 * Every selectable value has a stable machine-readable `id` (stored in the
 * profile) and a human-readable `label` (rendered by the UI). Descriptions
 * are short by design so the forms never feel overwhelming.
 */
import type {
  ActivityLevel,
  DietaryType,
  Gender,
  Goal,
  MealId,
} from "@/types/profile";

export interface Option<T extends string = string> {
  id: T;
  label: string;
  description?: string;
}

/* ------------------------------------------------------------------ */
/* Part 2 options                                                      */
/* ------------------------------------------------------------------ */

export const GENDER_OPTIONS: Option<Gender>[] = [
  { id: "male", label: "Male" },
  { id: "female", label: "Female" },
  { id: "other", label: "Other" },
  { id: "prefer_not_to_say", label: "Prefer not to say" },
];

export const ACTIVITY_LEVELS: Option<ActivityLevel>[] = [
  {
    id: "sedentary",
    label: "Sedentary",
    description: "Little or no regular physical activity.",
  },
  {
    id: "lightly_active",
    label: "Lightly Active",
    description: "Some light physical activity or exercise during the week.",
  },
  {
    id: "moderately_active",
    label: "Moderately Active",
    description: "Regular moderate exercise or an active daily routine.",
  },
  {
    id: "very_active",
    label: "Very Active",
    description: "Frequent intense exercise or a physically active lifestyle.",
  },
  {
    id: "extremely_active",
    label: "Extremely Active",
    description: "Very high physical activity or strenuous daily work or training.",
  },
];

/* ------------------------------------------------------------------ */
/* Part 3 options                                                      */
/* ------------------------------------------------------------------ */

export const GOALS: Option<Goal>[] = [
  {
    id: "weight_loss",
    label: "Weight Loss",
    description: "Support a balanced, calorie-aware eating pattern.",
  },
  {
    id: "weight_maintenance",
    label: "Weight Maintenance",
    description: "Keep your current weight with a balanced daily routine.",
  },
  {
    id: "weight_gain",
    label: "Weight Gain",
    description: "Support increased energy intake through balanced meals.",
  },
  {
    id: "muscle_gain",
    label: "Muscle Gain",
    description: "Emphasise adequate protein and energy alongside training.",
  },
  {
    id: "general_health",
    label: "General Healthy Eating",
    description: "Focus on balanced, varied and nutrient-rich food choices.",
  },
  {
    id: "improve_eating_habits",
    label: "Improve Eating Habits",
    description: "Build steadier, more mindful everyday eating patterns.",
  },
];

export const DIETARY_TYPES: Option<DietaryType>[] = [
  {
    id: "vegetarian",
    label: "Vegetarian",
    description: "Plant-based foods; no meat, fish or eggs.",
  },
  {
    id: "vegan",
    label: "Vegan",
    description: "Plant-based foods without animal-derived ingredients.",
  },
  {
    id: "non_vegetarian",
    label: "Non-Vegetarian",
    description: "May include meat, poultry, fish or eggs.",
  },
  {
    id: "eggetarian",
    label: "Eggetarian",
    description: "Vegetarian-style eating that includes eggs.",
  },
  {
    id: "pescatarian",
    label: "Pescatarian",
    description: "Vegetarian-style eating that includes fish.",
  },
];

export const COMMON_ALLERGENS: Option[] = [
  { id: "milk_dairy", label: "Milk / Dairy" },
  { id: "eggs", label: "Eggs" },
  { id: "peanuts", label: "Peanuts" },
  { id: "tree_nuts", label: "Tree Nuts" },
  { id: "soy", label: "Soy" },
  { id: "wheat", label: "Wheat" },
  { id: "gluten", label: "Gluten" },
  { id: "fish", label: "Fish" },
  { id: "shellfish", label: "Shellfish" },
  { id: "sesame", label: "Sesame" },
];

export const COMMON_INTOLERANCES: Option[] = [
  { id: "lactose", label: "Lactose" },
  { id: "gluten", label: "Gluten" },
  { id: "dairy", label: "Dairy" },
  { id: "soy", label: "Soy" },
];

export const CUISINES: Option[] = [
  { id: "south_indian", label: "South Indian" },
  { id: "north_indian", label: "North Indian" },
  { id: "indian", label: "Indian" },
  { id: "continental", label: "Continental" },
  { id: "mediterranean", label: "Mediterranean" },
  { id: "asian", label: "Asian" },
  { id: "other", label: "Other" },
];

/**
 * Small local suggestion list for the food inputs.
 * Part 7 will replace this with the structured food database.
 */
export const SUGGESTED_FOODS: string[] = [
  "Rice",
  "Chapati",
  "Dal",
  "Paneer",
  "Chicken",
  "Eggs",
  "Fruits",
  "Vegetables",
  "Oats",
  "Curd",
  "Banana",
  "Apple",
  "Nuts",
  "Fish",
  "Milk",
  "Bread",
  "Salad",
  "Sprouts",
  "Idli",
  "Dosa",
  "Sambar",
  "Upma",
  "Poha",
  "Rajma",
  "Chickpeas",
  "Quinoa",
  "Sweet Potato",
  "Green Tea",
  "Coffee",
  "Tea",
  "Paratha",
  "Coconut Chutney",
];

/* ------------------------------------------------------------------ */
/* Part 4 options                                                      */
/* ------------------------------------------------------------------ */

export interface MealDefinition {
  id: MealId;
  label: string;
  description: string;
  /** Snacks and occasional foods may be skipped without any warning. */
  skippable: boolean;
}

export const MEALS: MealDefinition[] = [
  {
    id: "breakfast",
    label: "Breakfast",
    description: "What you usually eat to start the day.",
    skippable: true,
  },
  {
    id: "morningSnack",
    label: "Morning Snack",
    description: "Anything you eat between breakfast and lunch.",
    skippable: true,
  },
  {
    id: "lunch",
    label: "Lunch",
    description: "Your usual midday meal.",
    skippable: true,
  },
  {
    id: "eveningSnack",
    label: "Evening Snack",
    description: "Anything you eat between lunch and dinner.",
    skippable: true,
  },
  {
    id: "dinner",
    label: "Dinner",
    description: "Your usual evening meal.",
    skippable: true,
  },
  {
    id: "otherSnacks",
    label: "Other Snacks / Occasional Foods",
    description:
      "Late-night snacks, weekend treats, desserts, beverages or occasional meals out.",
    skippable: true,
  },
];

/** Portion units. Kept deliberately short and practical. */
export const FOOD_UNITS: Option[] = [
  { id: "piece", label: "piece(s)" },
  { id: "slice", label: "slice(s)" },
  { id: "bowl", label: "bowl(s)" },
  { id: "cup", label: "cup(s)" },
  { id: "plate", label: "plate(s)" },
  { id: "glass", label: "glass(es)" },
  { id: "serving", label: "serving(s)" },
  { id: "tablespoon", label: "tablespoon(s)" },
  { id: "teaspoon", label: "teaspoon(s)" },
  { id: "grams", label: "grams" },
  { id: "kg", label: "kg" },
  { id: "ml", label: "ml" },
  { id: "litre", label: "litre(s)" },
];

export const MEALS_PER_DAY_OPTIONS: Option[] = [
  { id: "2", label: "2 meals" },
  { id: "3", label: "3 meals" },
  { id: "4", label: "4 meals" },
  { id: "5", label: "5 meals" },
  { id: "6", label: "6 meals" },
  { id: "7", label: "More than 6" },
];

export const SNACKING_FREQUENCY_OPTIONS: Option[] = [
  { id: "rarely", label: "Rarely" },
  { id: "occasionally", label: "Occasionally" },
  { id: "often", label: "Often" },
  { id: "very_often", label: "Very often" },
];

export const LATE_NIGHT_EATING_OPTIONS: Option[] = [
  { id: "never", label: "Never" },
  { id: "occasionally", label: "Occasionally" },
  { id: "often", label: "Often" },
];

export const FOOD_AVAILABILITY_OPTIONS: Option[] = [
  { id: "mostly_homemade", label: "Mostly homemade" },
  { id: "college_canteen", label: "College canteen" },
  { id: "hostel_mess", label: "Hostel / mess" },
  { id: "restaurant_delivery", label: "Restaurant / food delivery" },
  { id: "mixed", label: "Mixed" },
];

export const MEAL_PREP_TIME_OPTIONS: Option[] = [
  { id: "very_little", label: "Very little" },
  { id: "ten_to_twenty", label: "10–20 minutes" },
  { id: "twenty_to_forty", label: "20–40 minutes" },
  { id: "more_than_forty", label: "More than 40 minutes" },
];

export const MEAL_PREP_PREFERENCE_OPTIONS: Option[] = [
  { id: "homemade", label: "Homemade" },
  { id: "ready_to_eat", label: "Ready-to-eat" },
  { id: "mixed", label: "Mixed" },
];

export const WEEKEND_DIFFERENCE_OPTIONS: Option[] = [
  { id: "no", label: "No" },
  { id: "slightly", label: "Slightly" },
  { id: "significantly", label: "Significantly" },
];

export const WATER_UNIT_OPTIONS: Option[] = [
  { id: "litres", label: "Litres per day" },
  { id: "glasses", label: "Glasses per day" },
  { id: "unknown", label: "Not sure" },
];

/* ------------------------------------------------------------------ */
/* Part 6 labels                                                       */
/* ------------------------------------------------------------------ */

export const BMI_CATEGORY_LABELS: Record<string, string> = {
  underweight: "Underweight range",
  normal: "Normal range",
  overweight: "Overweight range",
  obesity: "Obesity range",
};

/* ------------------------------------------------------------------ */
/* Questionnaire progress structure (shared by planner + review pages) */
/* ------------------------------------------------------------------ */

export interface ProgressStep {
  id: string;
  label: string;
  shortLabel?: string;
}

export const PLANNER_STEPS: ProgressStep[] = [
  { id: "personal", label: "Personal" },
  { id: "nutrition", label: "Nutrition" },
  { id: "preferences", label: "Preferences" },
  { id: "food_intake", label: "Food Intake", shortLabel: "Intake" },
  { id: "review", label: "Review" },
];

/* ------------------------------------------------------------------ */
/* Label helpers                                                       */
/* ------------------------------------------------------------------ */

export function labelFor(list: Option[], id: string): string {
  return list.find((option) => option.id === id)?.label ?? id;
}

export function allergenLabel(id: string): string {
  if (id === "none") return "No known food allergies";
  if (id.startsWith("other:")) return `Other: ${id.slice(6)}`;
  return labelFor(COMMON_ALLERGENS, id);
}

export function intoleranceLabel(id: string): string {
  if (id.startsWith("other:")) return `Other: ${id.slice(6)}`;
  return labelFor(COMMON_INTOLERANCES, id);
}

export function mealLabel(id: MealId): string {
  return MEALS.find((meal) => meal.id === id)?.label ?? id;
}

export function unitLabel(id: string): string {
  if (!id) return "";
  return labelFor(FOOD_UNITS, id);
}

/** "08:00" → "8:00 AM". Returns "" for unspecified times. */
export function formatTime(value: string): string {
  if (!value) return "";
  const [hoursText, minutesText] = value.split(":");
  const hours = Number(hoursText);
  if (!Number.isFinite(hours)) return value;
  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHour}:${minutesText ?? "00"} ${suffix}`;
}

/** "3 piece(s)" from a structured quantity + unit pair. */
export function formatQuantity(
  quantity: number | null,
  unit: string,
): string {
  if (quantity === null && !unit) return "";
  if (quantity === null) return unitLabel(unit);
  if (!unit) return String(quantity);
  return `${quantity} ${unitLabel(unit)}`;
}
