/**
 * Part 5 — persistence service.
 *
 * The ONLY module in the application that knows where data physically
 * lives. Everything else (context, pages, processing engine) talks to the
 * small API below, so swapping browser storage for a REST/database backend
 * later means changing this file alone.
 *
 * Current implementation: `window.localStorage`, JSON-encoded.
 * Limitations are documented at the bottom of this file.
 */
import {
  CURRENT_PROFILE_VERSION,
  type DietPlan,
  type ProcessedProfile,
  type UserProfile,
} from "@/types/profile";
import { rehydrateProfile } from "@/lib/profileNormalize";
import { createId } from "@/lib/id";

/** One central key per stored artefact — never inline string literals. */
export const PROFILE_STORAGE_KEY = "PERSONALISED_DIET_PLANNER_PROFILE";
export const PROCESSED_STORAGE_KEY =
  "PERSONALISED_DIET_PLANNER_PROCESSED_PROFILE";
export const PLAN_STORAGE_KEY = "PERSONALISED_DIET_PLANNER_CURRENT_PLAN";

/* ------------------------------------------------------------------ */
/* Result types                                                        */
/* ------------------------------------------------------------------ */

export type ReadResult<T> =
  | { status: "empty" }
  | { status: "ok"; data: T }
  | { status: "unavailable"; message: string }
  | { status: "corrupt"; message: string };

export type WriteResult =
  | { ok: true }
  | { ok: false; message: string };

/* ------------------------------------------------------------------ */
/* Availability                                                        */
/* ------------------------------------------------------------------ */

/** Private browsing, disabled storage and SSR all land here safely. */
export function isStorageAvailable(): boolean {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    const probe = "__pdp_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function readRaw(key: string): ReadResult<unknown> {
  if (!isStorageAvailable()) {
    return {
      status: "unavailable",
      message: "Browser storage is not available in this environment.",
    };
  }
  const raw = window.localStorage.getItem(key);
  if (raw === null || raw.trim() === "") return { status: "empty" };

  try {
    return { status: "ok", data: JSON.parse(raw) as unknown };
  } catch {
    return {
      status: "corrupt",
      message: "The saved data could not be read because it is damaged.",
    };
  }
}

function writeRaw(key: string, value: unknown): WriteResult {
  if (!isStorageAvailable()) {
    return {
      ok: false,
      message:
        "Browser storage is not available, so your information could not be saved.",
    };
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return { ok: true };
  } catch (error) {
    const quotaExceeded =
      error instanceof DOMException &&
      (error.name === "QuotaExceededError" ||
        error.name === "NS_ERROR_DOM_QUOTA_REACHED");
    return {
      ok: false,
      message: quotaExceeded
        ? "There is not enough space left in your browser storage."
        : "Your profile could not be saved. Please try again.",
    };
  }
}

function removeRaw(key: string): void {
  if (!isStorageAvailable()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing useful to do — the caller resets in-memory state regardless.
  }
}

/* ------------------------------------------------------------------ */
/* User profile                                                        */
/* ------------------------------------------------------------------ */

/**
 * Reads the stored profile and rehydrates it against the current model,
 * so profiles written by an older version keep working (light migration).
 */
export function getProfile(): ReadResult<UserProfile> {
  const result = readRaw(PROFILE_STORAGE_KEY);
  if (result.status !== "ok") return result;

  // A stored value that is not an object is treated as corrupt.
  if (!result.data || typeof result.data !== "object" || Array.isArray(result.data)) {
    return {
      status: "corrupt",
      message: "The saved profile has an unexpected format.",
    };
  }

  const profile = rehydrateProfile(result.data);
  // Version bump = fields merged from defaults above; record the new version.
  profile.profileVersion = CURRENT_PROFILE_VERSION;
  return { status: "ok", data: profile };
}



/**
 * Creates or updates the single active profile.
 *
 * - `profileId` and `createdAt` are assigned once and then preserved.
 * - `updatedAt` is refreshed on every successful save.
 *
 * Returns the exact profile that was persisted so the caller can adopt it
 * as the new "last saved" snapshot.
 */
export function saveProfile(profile: UserProfile): WriteResult & {
  saved?: UserProfile;
} {
  const now = new Date().toISOString();
  const existing = getProfile();
  const previous = existing.status === "ok" ? existing.data : null;

  const toStore: UserProfile = {
    ...profile,
    profileVersion: CURRENT_PROFILE_VERSION,
    profileId: profile.profileId || previous?.profileId || createId("profile"),
    createdAt: profile.createdAt ?? previous?.createdAt ?? now,
    updatedAt: now,
  };

  const result = writeRaw(PROFILE_STORAGE_KEY, toStore);
  return result.ok ? { ok: true, saved: toStore } : result;
}

export function deleteProfile(): void {
  removeRaw(PROFILE_STORAGE_KEY);
  removeRaw(PROCESSED_STORAGE_KEY);
  removeRaw(PLAN_STORAGE_KEY);
}

/* ------------------------------------------------------------------ */
/* Processed nutrition profile (Part 6 derived data)                   */
/* ------------------------------------------------------------------ */

/**
 * Stored under a SEPARATE key: derived results must never overwrite or
 * contaminate the user's own answers.
 */
export function getProcessedProfile(): ReadResult<ProcessedProfile> {
  const result = readRaw(PROCESSED_STORAGE_KEY);
  if (result.status !== "ok") return result;

  const data = result.data as Partial<ProcessedProfile> | null;
  if (
    !data ||
    typeof data !== "object" ||
    typeof data.processedAt !== "string" ||
    typeof data.sourceProfileId !== "string"
  ) {
    return {
      status: "corrupt",
      message: "The saved nutrition results have an unexpected format.",
    };
  }
  return { status: "ok", data: data as ProcessedProfile };
}

export function saveProcessedProfile(processed: ProcessedProfile): WriteResult {
  return writeRaw(PROCESSED_STORAGE_KEY, processed);
}

export function deleteProcessedProfile(): void {
  removeRaw(PROCESSED_STORAGE_KEY);
}

/* ------------------------------------------------------------------ */
/* Generated diet plan (Part 7 derived data)                           */
/* ------------------------------------------------------------------ */

/**
 * Stored under its OWN key. The generated plan is derived output and
 * must never be mixed into, or overwrite, the user's source profile.
 */
export function getDietPlan(): ReadResult<DietPlan> {
  const result = readRaw(PLAN_STORAGE_KEY);
  if (result.status !== "ok") return result;

  const data = result.data as Partial<DietPlan> | null;
  if (
    !data ||
    typeof data !== "object" ||
    typeof data.id !== "string" ||
    typeof data.generatedAt !== "string" ||
    !Array.isArray(data.meals) ||
    !data.dailyTotals ||
    !data.summary
  ) {
    return {
      status: "corrupt",
      message: "The saved diet plan has an unexpected format.",
    };
  }
  return { status: "ok", data: data as DietPlan };
}

export function saveDietPlan(plan: DietPlan): WriteResult {
  return writeRaw(PLAN_STORAGE_KEY, plan);
}

export function deleteDietPlan(): void {
  removeRaw(PLAN_STORAGE_KEY);
}

/* ------------------------------------------------------------------ */
/* Known limitations of this storage approach                          */
/* ------------------------------------------------------------------ */
/*
 * 1. Data lives in ONE browser on ONE device; it does not sync.
 * 2. Clearing browser data / private windows will remove the profile.
 * 3. localStorage is not encrypted — it is not suitable for secrets.
 *    The planner therefore never collects passwords or identifiers.
 * 4. Storage is limited (~5 MB per origin); quota errors are handled.
 * 5. A single active profile is supported, which matches the project brief.
 */
