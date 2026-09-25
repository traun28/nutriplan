"use client";

/**
 * Central application state for the Personalised Diet Planner.
 *
 * One `UserProfile` object is the single source of truth shared by:
 *   - the questionnaire sections (Parts 2–4)
 *   - the review page
 *   - the storage layer (Part 5)
 *   - the processing engine (Part 6)
 *   - the diet-plan dashboard (Parts 7–8)
 *
 * Part 5 wiring:
 *   - on mount the saved profile is read through `services/profileStorage`
 *     and loaded into state (`hydrated` flips to true afterwards);
 *   - saving is always an explicit user action — there is no autosave;
 *   - `savedProfile` keeps the last persisted snapshot so the UI can show
 *     an accurate "unsaved changes" indicator.
 *
 * This component never touches `localStorage` directly.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  createEmptyProfile,
  MEAL_IDS,
  type DietaryPreferences,
  type FoodItem,
  type MealEntry,
  type MealHabits,
  type MealId,
  type NutritionalInformation,
  type PersonalDetails,
  type PracticalConstraints,
  type UserProfile,
  type WaterIntake,
} from "@/types/profile";
import {
  isFoodIntakeComplete,
  isNutritionComplete,
  isPersonalDetailsComplete,
} from "@/lib/validation";
import {
  createFoodItem,
  normalizeProfileForStorage,
  profilesAreEquivalent,
  rehydrateProfile,
} from "@/lib/profileNormalize";
import { normalizeFood, removeValue } from "@/lib/normalize";
import {
  deleteProfile as deleteStoredProfile,
  getProfile,
  saveProfile as persistProfile,
} from "@/services/profileStorage";
import { apiClient } from "@/services/apiClient";
import { useAuth } from "@/context/AuthContext";

export type SaveStatus = "idle" | "saving" | "saved" | "error";
export type StorageStatus = "loading" | "ready" | "unavailable" | "corrupt";

interface ProfileContextValue {
  profile: UserProfile;
  /** False until the stored profile has been read (prevents flicker). */
  hydrated: boolean;
  storageStatus: StorageStatus;
  storageMessage: string | null;

  /* Part 2–3 updaters */
  updatePersonalDetails: (patch: Partial<PersonalDetails>) => void;
  updateNutrition: (patch: Partial<NutritionalInformation>) => void;
  updateDietary: (patch: Partial<DietaryPreferences>) => void;
  setAllergies: (allergies: string[]) => void;
  setIntolerances: (intolerances: string[]) => void;
  setPreferredFoods: (foods: string[]) => void;
  setFoodsToAvoid: (foods: string[]) => void;
  removePreferredFood: (food: string) => void;
  removeFoodToAvoid: (food: string) => void;

  /* Part 4 updaters */
  updateMeal: (mealId: MealId, patch: Partial<Omit<MealEntry, "items">>) => void;
  addFoodItem: (mealId: MealId) => string;
  updateFoodItem: (
    mealId: MealId,
    itemId: string,
    patch: Partial<Omit<FoodItem, "id">>,
  ) => void;
  removeFoodItem: (mealId: MealId, itemId: string) => void;
  setMealTiming: (mealId: MealId, time: string) => void;
  updateMealHabits: (patch: Partial<MealHabits>) => void;
  updateWaterIntake: (patch: Partial<WaterIntake>) => void;
  updatePracticalConstraints: (patch: Partial<PracticalConstraints>) => void;
  setAdditionalInformation: (text: string) => void;

  /* Part 5 profile management */
  savedProfile: UserProfile | null;
  hasSavedProfile: boolean;
  hasUnsavedChanges: boolean;
  saveStatus: SaveStatus;
  saveError: string | null;
  /** Resolves with the persisted profile, or null when saving failed. */
  saveProfile: () => Promise<UserProfile | null>;
  deleteSavedProfile: () => void;
  startNewProfile: () => void;
  discardCorruptData: () => void;
  /**
   * Part 12 — applies a confirmed import patch (from a reviewed attachment).
   * Safety lists are appended to, never replaced. Marks the profile as
   * having unsaved changes so the user must Save before it persists.
   */
  applyImportedPatch: (patch: {
    personalDetails?: Record<string, unknown>;
    nutritionalInformation?: Record<string, unknown>;
    dietaryPreferences?: Record<string, unknown>;
    appendToAllergies?: string[];
    appendToIntolerances?: string[];
    appendToFoodsToAvoid?: string[];
    foodIntake?: Record<string, Array<{ name: string }>> | Partial<Record<string, Array<{ name: string }>>>;
  }) => void;

  /** True once the server copy has been reconciled (or skipped). */
  synced: boolean;
  /** Set when the server copy could not be read/written. */
  syncError: string | null;

  /** Derived completion flags, computed from validation (not UI flags). */
  completion: {
    personalComplete: boolean;
    nutritionComplete: boolean;
    foodIntakeComplete: boolean;
    completedSections: number;
    totalSections: number;
    hasAnyData: boolean;
  };
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<UserProfile>(() => createEmptyProfile());
  const [savedProfile, setSavedProfile] = useState<UserProfile | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [storageStatus, setStorageStatus] = useState<StorageStatus>("loading");
  const [storageMessage, setStorageMessage] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [synced, setSynced] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ------------------------- load on mount ------------------------- */

  /**
   * Two-phase hydration so the UI is never blank and never stuck:
   *
   *   1. Read localStorage synchronously and mark hydrated immediately.
   *      This paints real content on the very first frame.
   *   2. Reconcile with the server (source of truth when signed in) — see
   *      the `user` effect below.
   *
   * A watchdog also guarantees `hydrated` becomes true even if the local
   * read were to fail unexpectedly, so no screen can spin forever.
   *
   * The server read is deliberately NOT issued here: `/api/profile` requires
   * a session, so calling it on mount meant every signed-out page view sent
   * an authenticated request that was (correctly) answered with 401 — noise
   * in the production logs and a misleading "working from this browser's
   * copy" state. The reconcile runs from the effect that reacts to the
   * resolved session instead, so the request always carries a real session
   * and signed-out visitors simply use their local copy.
   */
  useEffect(() => {
    let cancelled = false;

    const watchdog = setTimeout(() => {
      if (!cancelled) setHydrated(true);
    }, 3000);

    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const result = getProfile();
        if (result.status === "ok") {
          setProfile(result.data);
          setSavedProfile(result.data);
          setStorageStatus("ready");
        } else if (result.status === "empty") {
          setStorageStatus("ready");
        } else if (result.status === "unavailable") {
          setStorageStatus("unavailable");
          setStorageMessage(result.message);
        } else {
          setStorageStatus("corrupt");
          setStorageMessage(result.message);
        }
      } catch {
        setStorageStatus("unavailable");
        setStorageMessage("This browser's storage could not be read.");
      } finally {
        if (!cancelled) setHydrated(true);
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(watchdog);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void apiClient
      .get<{ profile: UserProfile | null }>("/api/profile")
      .then((data) => {
        if (cancelled || !data.profile) return;
        const saved = rehydrateProfile(data.profile);
        setProfile(saved);
        setSavedProfile(saved);
        persistProfile(saved);
        setStorageStatus("ready");
        setSyncError(null);
      })
      .catch(() => {
        if (!cancelled) setSyncError("Your account data could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setSynced(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // A visitor with no session has nothing to reconcile with the server, so
  // the sync state resolves as soon as the session check finishes.
  useEffect(() => {
    if (authLoading || user) return;
    const task = setTimeout(() => setSynced(true), 0);
    return () => clearTimeout(task);
  }, [authLoading, user]);

  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  /** Any edit clears a lingering "Saved" badge. */
  const markDirty = useCallback(() => {
    setSaveStatus((current) => (current === "saved" ? "idle" : current));
  }, []);

  const patchProfile = useCallback(
    (updater: (current: UserProfile) => UserProfile) => {
      markDirty();
      setProfile(updater);
    },
    [markDirty],
  );

  /* ----------------------- Part 2–3 updaters ----------------------- */

  const updatePersonalDetails = useCallback(
    (patch: Partial<PersonalDetails>) =>
      patchProfile((current) => ({
        ...current,
        personalDetails: { ...current.personalDetails, ...patch },
      })),
    [patchProfile],
  );

  const updateNutrition = useCallback(
    (patch: Partial<NutritionalInformation>) =>
      patchProfile((current) => ({
        ...current,
        nutritionalInformation: { ...current.nutritionalInformation, ...patch },
      })),
    [patchProfile],
  );

  const updateDietary = useCallback(
    (patch: Partial<DietaryPreferences>) =>
      patchProfile((current) => ({
        ...current,
        dietaryPreferences: { ...current.dietaryPreferences, ...patch },
      })),
    [patchProfile],
  );

  const setAllergies = useCallback(
    (allergies: string[]) =>
      patchProfile((current) => ({ ...current, allergies })),
    [patchProfile],
  );

  const setIntolerances = useCallback(
    (intolerances: string[]) =>
      patchProfile((current) => ({ ...current, intolerances })),
    [patchProfile],
  );

  const setPreferredFoods = useCallback(
    (foods: string[]) =>
      patchProfile((current) => ({
        ...current,
        preferredFoods: foods.map(normalizeFood).filter(Boolean),
      })),
    [patchProfile],
  );

  const setFoodsToAvoid = useCallback(
    (foods: string[]) =>
      patchProfile((current) => ({
        ...current,
        foodsToAvoid: foods.map(normalizeFood).filter(Boolean),
      })),
    [patchProfile],
  );

  const removePreferredFood = useCallback(
    (food: string) =>
      patchProfile((current) => ({
        ...current,
        preferredFoods: removeValue(current.preferredFoods, normalizeFood(food)),
      })),
    [patchProfile],
  );

  const removeFoodToAvoid = useCallback(
    (food: string) =>
      patchProfile((current) => ({
        ...current,
        foodsToAvoid: removeValue(current.foodsToAvoid, normalizeFood(food)),
      })),
    [patchProfile],
  );

  /* -------------------------- Part 4 updaters ---------------------- */

  const updateMeal = useCallback(
    (mealId: MealId, patch: Partial<Omit<MealEntry, "items">>) =>
      patchProfile((current) => ({
        ...current,
        foodIntake: {
          ...current.foodIntake,
          [mealId]: { ...current.foodIntake[mealId], ...patch },
        },
      })),
    [patchProfile],
  );

  const addFoodItem = useCallback(
    (mealId: MealId) => {
      const item = createFoodItem();
      patchProfile((current) => ({
        ...current,
        foodIntake: {
          ...current.foodIntake,
          [mealId]: {
            ...current.foodIntake[mealId],
            items: [...current.foodIntake[mealId].items, item],
          },
        },
      }));
      return item.id;
    },
    [patchProfile],
  );

  const updateFoodItem = useCallback(
    (mealId: MealId, itemId: string, patch: Partial<Omit<FoodItem, "id">>) =>
      patchProfile((current) => ({
        ...current,
        foodIntake: {
          ...current.foodIntake,
          [mealId]: {
            ...current.foodIntake[mealId],
            items: current.foodIntake[mealId].items.map((item) =>
              item.id === itemId ? { ...item, ...patch } : item,
            ),
          },
        },
      })),
    [patchProfile],
  );

  const removeFoodItem = useCallback(
    (mealId: MealId, itemId: string) =>
      patchProfile((current) => ({
        ...current,
        foodIntake: {
          ...current.foodIntake,
          [mealId]: {
            ...current.foodIntake[mealId],
            items: current.foodIntake[mealId].items.filter(
              (item) => item.id !== itemId,
            ),
          },
        },
      })),
    [patchProfile],
  );

  const setMealTiming = useCallback(
    (mealId: MealId, time: string) =>
      patchProfile((current) => ({
        ...current,
        mealTimings: { ...current.mealTimings, [mealId]: time },
      })),
    [patchProfile],
  );

  const updateMealHabits = useCallback(
    (patch: Partial<MealHabits>) =>
      patchProfile((current) => ({
        ...current,
        mealHabits: { ...current.mealHabits, ...patch },
      })),
    [patchProfile],
  );

  const updateWaterIntake = useCallback(
    (patch: Partial<WaterIntake>) =>
      patchProfile((current) => ({
        ...current,
        waterIntake: { ...current.waterIntake, ...patch },
      })),
    [patchProfile],
  );

  const updatePracticalConstraints = useCallback(
    (patch: Partial<PracticalConstraints>) =>
      patchProfile((current) => ({
        ...current,
        practicalConstraints: { ...current.practicalConstraints, ...patch },
      })),
    [patchProfile],
  );

  const setAdditionalInformation = useCallback(
    (text: string) =>
      patchProfile((current) => ({ ...current, additionalInformation: text })),
    [patchProfile],
  );

  /* --------------------- Part 5 profile management ------------------ */

  const saveProfile = useCallback(async (): Promise<UserProfile | null> => {
    setSaveStatus("saving");
    setSaveError(null);

    const normalized = normalizeProfileForStorage(profile);
    const result = persistProfile(normalized);

    if (!result.ok || !result.saved) {
      setSaveStatus("error");
      setSaveError(
        result.ok ? "Your profile could not be saved." : result.message,
      );
      return null;
    }

    setProfile(result.saved);
    setSavedProfile(result.saved);
    setStorageStatus("ready");
    setStorageMessage(null);
    setSaveStatus("saved");

    // Mirror to the server so the profile is available on the external
    // site and survives clearing this browser. A failure here does not
    // lose the local save, but it IS reported honestly.
    void apiClient
      .put("/api/profile", { profile: result.saved })
      .then(() => setSyncError(null))
      .catch(() =>
        setSyncError(
          "Saved on this device, but it could not be saved to your account.",
        ),
      );

    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaveStatus("idle"), 4000);
    // Returned so callers can act on the exact persisted revision
    // (React state is not updated synchronously).
    return result.saved;
  }, [profile]);

  const deleteSavedProfile = useCallback(() => {
    deleteStoredProfile();
    void apiClient.delete("/api/profile").catch(() => {
      // The local copy is already gone; nothing further to undo.
    });
    setProfile(createEmptyProfile());
    setSavedProfile(null);
    setSaveStatus("idle");
    setSaveError(null);
  }, []);

  /** Clears the working copy but leaves the stored profile untouched
   *  until the user saves the new one. */
  const startNewProfile = useCallback(() => {
    setProfile(createEmptyProfile());
    setSaveStatus("idle");
    setSaveError(null);
  }, []);

  const discardCorruptData = useCallback(() => {
    deleteStoredProfile();
    setStorageStatus("ready");
    setStorageMessage(null);
  }, []);

  /**
   * Part 12 — applies a confirmed import patch.
   * Safety lists (allergies/intolerances/foodsToAvoid) are APPENDED to the
   * user's existing values and never replace them. Numeric fields are
   * coerced so a string from a document cannot corrupt the profile.
   */
  const applyImportedPatch = useCallback(
    (patch: {
      personalDetails?: Record<string, unknown>;
      nutritionalInformation?: Record<string, unknown>;
      dietaryPreferences?: Record<string, unknown>;
      appendToAllergies?: string[];
      appendToIntolerances?: string[];
      appendToFoodsToAvoid?: string[];
      foodIntake?: Record<string, Array<{ name: string }>> | Partial<Record<string, Array<{ name: string }>>>;
    }) => {
      setProfile((current) => {
        const next = structuredClone(current);
        const numeric = (v: unknown) =>
          typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;

        if (patch.personalDetails) {
          for (const [key, value] of Object.entries(patch.personalDetails)) {
            const numericKeys = ["age", "heightCm", "weightKg"];
            (next.personalDetails as unknown as Record<string, unknown>)[key] = numericKeys.includes(key)
              ? numeric(value)
              : value;
          }
        }
        if (patch.nutritionalInformation) {
          for (const [key, value] of Object.entries(patch.nutritionalInformation)) {
            const numericKeys = ["dailyCalorieTarget", "proteinTargetGrams"];
            (next.nutritionalInformation as unknown as Record<string, unknown>)[key] =
              numericKeys.includes(key) ? numeric(value) : value;
          }
        }
        if (patch.dietaryPreferences) {
          for (const [key, value] of Object.entries(patch.dietaryPreferences)) {
            (next.dietaryPreferences as unknown as Record<string, unknown>)[key] = value;
          }
        }
        for (const allergen of patch.appendToAllergies ?? []) {
          if (allergen && !next.allergies.includes(allergen)) {
            next.allergies = [...next.allergies, allergen];
          }
        }
        for (const intolerance of patch.appendToIntolerances ?? []) {
          if (intolerance && !next.intolerances.includes(intolerance)) {
            next.intolerances = [...next.intolerances, intolerance];
          }
        }
        for (const food of patch.appendToFoodsToAvoid ?? []) {
          if (food && !next.foodsToAvoid.includes(food)) {
            next.foodsToAvoid = [...next.foodsToAvoid, food];
          }
        }
        for (const [slot, items] of Object.entries(patch.foodIntake ?? {})) {
          const mealId = slot as MealId;
          if (!(mealId in next.foodIntake) || !Array.isArray(items)) continue;
          next.foodIntake[mealId] = {
            ...next.foodIntake[mealId],
            hasMeal: true,
            items: [
              ...next.foodIntake[mealId].items,
              ...items
                .filter((item) => item.name && item.name.trim())
                .map((item) => ({ ...createFoodItem(), name: item.name.trim() })),
            ],
          };
        }
        return next;
      });
      // The working copy changed; it must be saved before it is current.
      setSaveStatus("idle");
      setSaveError(null);
    },
    [],
  );

  /* ----------------------------- derived --------------------------- */

  const value = useMemo<ProfileContextValue>(() => {
    const personalComplete = isPersonalDetailsComplete(profile.personalDetails);
    const nutritionComplete = isNutritionComplete(
      profile.nutritionalInformation,
      profile.dietaryPreferences,
    );
    const foodIntakeComplete = isFoodIntakeComplete(profile.foodIntake);

    const hasFoodRows = MEAL_IDS.some(
      (mealId) => profile.foodIntake[mealId].items.length > 0,
    );

    const hasAnyData =
      personalComplete ||
      nutritionComplete ||
      hasFoodRows ||
      profile.allergies.length > 0 ||
      profile.intolerances.length > 0 ||
      profile.preferredFoods.length > 0 ||
      profile.foodsToAvoid.length > 0 ||
      profile.additionalInformation.trim().length > 0 ||
      profile.personalDetails.fullName.trim().length > 0;

    const completedSections = [
      personalComplete,
      nutritionComplete,
      foodIntakeComplete,
    ].filter(Boolean).length;

    return {
      profile,
      hydrated,
      storageStatus,
      storageMessage,
      updatePersonalDetails,
      updateNutrition,
      updateDietary,
      setAllergies,
      setIntolerances,
      setPreferredFoods,
      setFoodsToAvoid,
      removePreferredFood,
      removeFoodToAvoid,
      updateMeal,
      addFoodItem,
      updateFoodItem,
      removeFoodItem,
      setMealTiming,
      updateMealHabits,
      updateWaterIntake,
      updatePracticalConstraints,
      setAdditionalInformation,
      savedProfile,
      hasSavedProfile: savedProfile !== null,
      hasUnsavedChanges:
        savedProfile !== null && !profilesAreEquivalent(profile, savedProfile),
      saveStatus,
      saveError,
      saveProfile,
      deleteSavedProfile,
      startNewProfile,
      discardCorruptData,
      applyImportedPatch,
      synced,
      syncError,
      completion: {
        personalComplete,
        nutritionComplete,
        foodIntakeComplete,
        completedSections,
        totalSections: 3,
        hasAnyData,
      },
    };
  }, [
    profile,
    hydrated,
    storageStatus,
    storageMessage,
    savedProfile,
    saveStatus,
    saveError,
    updatePersonalDetails,
    updateNutrition,
    updateDietary,
    setAllergies,
    setIntolerances,
    setPreferredFoods,
    setFoodsToAvoid,
    removePreferredFood,
    removeFoodToAvoid,
    updateMeal,
    addFoodItem,
    updateFoodItem,
    removeFoodItem,
    setMealTiming,
    updateMealHabits,
    updateWaterIntake,
    updatePracticalConstraints,
    setAdditionalInformation,
    saveProfile,
    deleteSavedProfile,
    startNewProfile,
    discardCorruptData,
    applyImportedPatch,
    synced,
    syncError,
  ]);

  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
}

/** Access the central user profile. Throws early if used outside provider. */
export function useProfile(): ProfileContextValue {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error("useProfile must be used within a ProfileProvider");
  }
  return context;
}
