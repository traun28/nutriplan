/**
 * Part 9 — the application's single state machine.
 *
 * Every page derives its status badge and PRIMARY action from this one
 * pure function, so the UI can never show two contradictory next steps
 * (e.g. "Plan ready" while the plan is actually stale).
 *
 * States, in order of precedence:
 *   profile_empty       nothing entered yet
 *   profile_incomplete  required answers still missing
 *   profile_unsaved     valid but never saved to this device
 *   nutrition_missing   saved, but targets not calculated
 *   nutrition_stale     profile changed after the last calculation
 *   plan_missing        targets ready, no plan generated
 *   plan_stale          profile changed after the plan was generated
 *   plan_invalid        plan exists but failed its safety validation
 *   plan_ready          everything current
 */
import type {
  DietPlan,
  ProcessedProfile,
  UserProfile,
} from "@/types/profile";
import { validateCompleteProfile, type ProfileIssue } from "@/lib/validation";
import { isDietPlanCurrent, isProcessedProfileCurrent } from "@/lib/freshness";

export type AppState =
  | "profile_empty"
  | "profile_incomplete"
  | "profile_unsaved"
  | "nutrition_missing"
  | "nutrition_stale"
  | "plan_missing"
  | "plan_stale"
  | "plan_invalid"
  | "plan_ready";

export type ActionKind = "link" | "save" | "calculate" | "generate" | "view";

export interface NextAction {
  label: string;
  kind: ActionKind;
  /** Present for "link" actions. */
  href?: string;
}

export interface AppStatus {
  state: AppState;
  /** Short status word shown in badges. */
  title: string;
  /** One plain-language sentence — never technical jargon. */
  description: string;
  /** The single most important next step. */
  action: NextAction;
  /** Outstanding profile problems, if any. */
  issues: ProfileIssue[];
  /** True when results on screen must not be presented as current. */
  needsAttention: boolean;
}

export interface StatusInput {
  profile: UserProfile;
  processed: ProcessedProfile | null;
  plan: DietPlan | null;
  hasSavedProfile: boolean;
  hasUnsavedChanges: boolean;
  hasAnyData: boolean;
}

export function getAppStatus({
  profile,
  processed,
  plan,
  hasSavedProfile,
  hasUnsavedChanges,
  hasAnyData,
}: StatusInput): AppStatus {
  const issues = validateCompleteProfile(profile);

  /* 1. Nothing entered at all. */
  if (!hasSavedProfile && !hasAnyData) {
    return {
      state: "profile_empty",
      title: "No profile yet",
      description:
        "Start by telling us about yourself so we can build a plan around you.",
      action: { label: "Create My Profile", kind: "link", href: "/planner" },
      issues,
      needsAttention: false,
    };
  }

  /* 2. Required answers still missing. */
  if (issues.length > 0) {
    return {
      state: "profile_incomplete",
      title: "Profile incomplete",
      description: `${issues.length} ${
        issues.length === 1 ? "detail is" : "details are"
      } still needed before your nutrition can be calculated.`,
      action: {
        label: "Complete Profile",
        kind: "link",
        href: `/planner?step=${issues[0].step}`,
      },
      issues,
      needsAttention: true,
    };
  }

  /* 3. Valid but never saved (or edited since the last save). */
  if (!hasSavedProfile || hasUnsavedChanges) {
    return {
      state: "profile_unsaved",
      title: hasSavedProfile ? "Unsaved changes" : "Profile not saved",
      description: hasSavedProfile
        ? "You have changes that have not been saved to this device yet."
        : "Your profile is complete. Save it so it is available next time.",
      action: { label: "Review & Save Profile", kind: "link", href: "/review" },
      issues,
      needsAttention: true,
    };
  }

  /* 4. Targets not calculated yet. */
  if (!processed || processed.status !== "complete") {
    return {
      state: "nutrition_missing",
      title: "Nutrition not calculated",
      description:
        "Calculate your estimated calorie and macronutrient targets to continue.",
      action: { label: "Calculate Nutrition", kind: "calculate" },
      issues,
      needsAttention: false,
    };
  }

  /* 5. Targets exist but were calculated from an older profile. */
  if (!isProcessedProfileCurrent(processed, profile)) {
    return {
      state: "nutrition_stale",
      title: "Nutrition needs recalculation",
      description:
        "Your profile has changed since your targets were calculated.",
      action: { label: "Recalculate Nutrition", kind: "calculate" },
      issues,
      needsAttention: true,
    };
  }

  /* 6. No plan yet. */
  if (!plan) {
    return {
      state: "plan_missing",
      title: "No diet plan yet",
      description:
        "Your targets are ready. Generate a daily plan built around them.",
      action: { label: "Generate Diet Plan", kind: "generate" },
      issues,
      needsAttention: false,
    };
  }

  /* 7. Plan generated from an older profile. */
  if (!isDietPlanCurrent(plan, profile)) {
    return {
      state: "plan_stale",
      title: "Diet plan is outdated",
      description:
        "This plan was generated using an older profile. Generate a new one to use your latest information.",
      action: { label: "Generate New Plan", kind: "generate" },
      issues,
      needsAttention: true,
    };
  }

  /* 8. Plan exists but failed validation — never presented as usable. */
  if (!plan.validation.isValid) {
    return {
      state: "plan_invalid",
      title: "Plan requires review",
      description:
        "This plan did not pass its safety check, so it is not being shown as current.",
      action: { label: "Generate New Plan", kind: "generate" },
      issues,
      needsAttention: true,
    };
  }

  /* 9. Everything current. */
  return {
    state: "plan_ready",
    title: "Diet plan ready",
    description: "Your personalised plan matches your latest saved profile.",
    action: { label: "View Diet Plan", kind: "link", href: "/diet-plan" },
    issues,
    needsAttention: false,
  };
}
