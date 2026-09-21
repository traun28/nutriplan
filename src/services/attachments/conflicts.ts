/**
 * Part 12 — extracted-value review and conflict detection.
 *
 * Extracted values are CANDIDATES. This module compares them against the
 * LIVE user profile and produces a review list where the user decides what
 * to import. It never writes to the profile.
 *
 * CRITICAL (requirement 30): safety-relevant values (allergies,
 * intolerances, foods to avoid) are NEVER overwritten by attachment data.
 * If a document mentions milk as allowed while the profile has a milk
 * allergy, the profile's allergy stays and the document's claim is shown
 * as an informational conflict that the user must explicitly resolve.
 */
import type {
  AttachmentRecord,
  ConflictType,
  ExtractedField,
  ExtractedFood,
} from "../../types/attachment.ts";
import type { UserProfile } from "../../types/profile.ts";
import { labelForKey } from "./engine.ts";
import { GENDER_OPTIONS } from "../../data/options.ts";

/* ------------------------------------------------------------------ */
/* Field mapping: extracted key → where it would live in the profile   */
/* ------------------------------------------------------------------ */

type ProfileTarget =
  | "personalDetails"
  | "nutritionalInformation"
  | "dietaryPreferences"
  | "safety"
  | "foodIntake"
  | "reference";

interface FieldMapping {
  target: ProfileTarget;
  /** Profile key for comparison + patching. */
  profileKey: string;
  label: string;
  safetyRelevant?: boolean;
}

const FIELD_MAP: Record<string, FieldMapping> = {
  age: { target: "personalDetails", profileKey: "age", label: "Age" },
  heightCm: { target: "personalDetails", profileKey: "heightCm", label: "Height" },
  weightKg: { target: "personalDetails", profileKey: "weightKg", label: "Weight" },
  gender: { target: "personalDetails", profileKey: "gender", label: "Gender" },
  activityLevel: { target: "personalDetails", profileKey: "activityLevel", label: "Activity level" },
  goal: { target: "nutritionalInformation", profileKey: "primaryGoal", label: "Goal" },
  dailyCalorieTarget: { target: "nutritionalInformation", profileKey: "dailyCalorieTarget", label: "Daily calorie target" },
  proteinTargetGrams: { target: "nutritionalInformation", profileKey: "proteinTargetGrams", label: "Protein target" },
  dietaryType: { target: "dietaryPreferences", profileKey: "dietaryType", label: "Dietary pattern" },
  allergen: { target: "safety", profileKey: "allergies", label: "Allergen", safetyRelevant: true },
  intolerance: { target: "safety", profileKey: "intolerances", label: "Intolerance", safetyRelevant: true },
  foodsToAvoid: { target: "safety", profileKey: "foodsToAvoid", label: "Foods to avoid", safetyRelevant: true },
};

/** Formats a live profile value for side-by-side display. */
export function formatProfileValue(
  profile: UserProfile,
  target: ProfileTarget,
  key: string,
): string | null {
  let value: unknown = null;
  if (target === "personalDetails") {
    value = (profile.personalDetails as unknown as Record<string, unknown>)[key];
  } else if (target === "nutritionalInformation") {
    value = (profile.nutritionalInformation as unknown as Record<string, unknown>)[key];
  } else if (target === "dietaryPreferences") {
    value = (profile.dietaryPreferences as unknown as Record<string, unknown>)[key];
  } else if (target === "safety") {
    const list = (profile as unknown as Record<string, string[]>)[key] ?? [];
    if (Array.isArray(list)) {
      if (key === "allergies") {
        const real = list.filter((a) => a !== "none");
        return real.length > 0 ? real.map(labelForList).join(", ") : "None declared";
      }
      return list.length > 0 ? list.map(labelForList).join(", ") : "None declared";
    }
  }
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function labelForList(value: string): string {
  const genderLabel = GENDER_OPTIONS.find((g) => g.id === value)?.label;
  if (genderLabel) return genderLabel;
  // Strip id prefixes for readability.
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ------------------------------------------------------------------ */
/* Conflict building                                                   */
/* ------------------------------------------------------------------ */

export interface ReviewItem {
  id: string;
  label: string;
  extractedValue: string;
  currentValue: string | null;
  conflictType: ConflictType;
  confidence: ExtractedField["confidence"];
  provenance: string;
  safetyRelevant: boolean;
  /** The profile field this would update, or null for reference-only. */
  target: ProfileTarget;
  profileKey: string;
  /** Machine value to apply if accepted. */
  proposedValue: string | number | null;
  /** For list fields (allergies etc.), whether to append vs replace. */
  append?: boolean;
}

/**
 * Builds the review list for one attachment.
 * Safety fields always get `conflictType = "safety_relevant"` and are
 * presented as ADDITIONS — the existing allergy list is never replaced.
 */
export function buildReviewItems(
  record: AttachmentRecord,
  profile: UserProfile,
): ReviewItem[] {
  const extraction = record.extraction;
  if (!extraction) return [];

  const items: ReviewItem[] = [];

  for (const field of extraction.fields) {
    const mapping = FIELD_MAP[field.key];
    if (!mapping) continue;

    const currentValue = formatProfileValue(profile, mapping.target, mapping.profileKey);
    const extractedValue = formatFieldDisplay(field);

    let conflictType: ConflictType;
    if (mapping.safetyRelevant) {
      conflictType = "safety_relevant";
    } else if (currentValue === null) {
      conflictType = "new_information";
    } else if (
      String(currentValue).toLowerCase().replace(/\s+/g, " ").trim() ===
      String(extractedValue).toLowerCase().replace(/\s+/g, " ").trim()
    ) {
      conflictType = "new_information"; // same value, no conflict
    } else {
      conflictType = "different_value";
    }

    items.push({
      id: `${record.attachmentId}-${field.key}-${items.length}`,
      label: mapping.label,
      extractedValue,
      currentValue,
      conflictType,
      confidence: field.confidence,
      provenance: field.provenance,
      safetyRelevant: Boolean(mapping.safetyRelevant),
      target: mapping.target,
      profileKey: mapping.profileKey,
      proposedValue: field.value,
      append: mapping.safetyRelevant,
    });
  }

  // Nutrition-label nutrients are reference information, not profile targets.
  if (extraction.nutrients.length > 0) {
    items.push({
      id: `${record.attachmentId}-nutrients`,
      label: "Nutrition label",
      extractedValue: extraction.nutrients
        .map((n) => `${n.nutrient}: ${n.value} ${n.unit}`)
        .join(" · "),
      currentValue: null,
      conflictType: "new_information",
      confidence: "medium",
      provenance: record.fileName,
      safetyRelevant: false,
      target: "reference",
      profileKey: "",
      proposedValue: null,
    });
  }

  // Extracted food items map to food intake.
  for (const food of extraction.foods.slice(0, 20)) {
    items.push({
      id: `${record.attachmentId}-food-${food.name}`,
      label: `Food — ${food.meal ? labelForKey(food.meal) : "Meal"}`,
      extractedValue: food.name,
      currentValue: null,
      conflictType: "new_information",
      confidence: food.confidence,
      provenance: food.provenance,
      safetyRelevant: false,
      target: "foodIntake",
      profileKey: food.meal ?? "otherSnacks",
      proposedValue: food.name,
    });
  }

  return items;
}

function formatFieldDisplay(field: ExtractedField): string {
  const value = field.value ?? field.rawValue;
  return field.unit ? `${value} ${field.unit}` : String(value);
}

/* ------------------------------------------------------------------ */
/* Import application (returns a patch the UI applies explicitly)      */
/* ------------------------------------------------------------------ */

export interface ProfilePatch {
  personalDetails: Record<string, unknown>;
  nutritionalInformation: Record<string, unknown>;
  dietaryPreferences: Record<string, unknown>;
  /** Values to append to each safety list (never replaces). */
  appendToAllergies: string[];
  appendToIntolerances: string[];
  appendToFoodsToAvoid: string[];
  /** Food items to append to foodIntake[slot]. */
  foodIntake: Partial<Record<string, Array<{ name: string }>>>;
  /** True when any safety-relevant change was included (needs a confirm). */
  touchesSafety: boolean;
  /** Human-readable summary for the confirmation dialog. */
  summary: string[];
}

export function emptyPatch(): ProfilePatch {
  return {
    personalDetails: {},
    nutritionalInformation: {},
    dietaryPreferences: {},
    appendToAllergies: [],
    appendToIntolerances: [],
    appendToFoodsToAvoid: [],
    foodIntake: {},
    touchesSafety: false,
    summary: [],
  };
}

/**
 * Applies the user's accepted review items to a patch object.
 * The UI applies this patch only after explicit confirmation.
 */
export function buildPatch(
  accepted: ReviewItem[],
  currentProfile: UserProfile,
): ProfilePatch {
  const patch = emptyPatch();
  const seen = new Set<string>();

  for (const item of accepted) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    const value = item.proposedValue;
    const label = item.label;

    if (item.target === "personalDetails" && value !== null) {
      patch.personalDetails[item.profileKey] = value;
      patch.summary.push(`${label}: ${item.extractedValue}`);
    } else if (item.target === "nutritionalInformation" && value !== null) {
      patch.nutritionalInformation[item.profileKey] = value;
      patch.summary.push(`${label}: ${item.extractedValue}`);
    } else if (item.target === "dietaryPreferences" && value !== null) {
      patch.dietaryPreferences[item.profileKey] = value;
      patch.summary.push(`${label}: ${item.extractedValue}`);
    } else if (item.target === "safety" && value !== null) {
      patch.touchesSafety = true;
      const text = String(value);
      // Parse comma/and-separated lists into ids where possible.
      const values = text
        .split(/\s*(?:,|;|\band\b|&)\s*/i)
        .map((v) => v.trim().toLowerCase().replace(/\s+/g, "_"))
        .filter(Boolean);
      if (item.profileKey === "allergies") {
        for (const v of values) {
          if (!patch.appendToAllergies.includes(v)) patch.appendToAllergies.push(v);
        }
      } else if (item.profileKey === "intolerances") {
        for (const v of values) {
          if (!patch.appendToIntolerances.includes(v)) patch.appendToIntolerances.push(v);
        }
      } else if (item.profileKey === "foodsToAvoid") {
        for (const v of values) {
          if (!patch.appendToFoodsToAvoid.includes(v)) patch.appendToFoodsToAvoid.push(v);
        }
      }
      patch.summary.push(`${label}: add "${text}" (existing restrictions kept)`);
    } else if (item.target === "foodIntake" && value !== null) {
      const slot = item.profileKey;
      if (!patch.foodIntake[slot]) patch.foodIntake[slot] = [];
      const name = String(value);
      if (!patch.foodIntake[slot]!.some((f) => f.name === name)) {
        patch.foodIntake[slot]!.push({ name });
        patch.summary.push(`Add "${name}" to ${label}`);
      }
    }
    // reference items (nutrients) are not applied
  }

  return patch;
}

/* ------------------------------------------------------------------ */
/* Food item helper                                                    */
/* ------------------------------------------------------------------ */

export function foodItemsFromRecord(record: AttachmentRecord): ExtractedFood[] {
  return record.extraction?.foods ?? [];
}
