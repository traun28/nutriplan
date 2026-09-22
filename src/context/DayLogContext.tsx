"use client";

/**
 * Phase 2 — daily log state (food entries, water, favourites, recents).
 *
 * One provider owns the selected date and everything logged for it, so the
 * dashboard, the Log Food dialog and the history page all update together
 * after any create / edit / delete without a page reload. Totals are
 * derived with the shared `sumEntries` helper — never recomputed ad hoc.
 *
 * Mutations go through the existing `apiClient`; the user id is never sent
 * (the server takes it from the session).
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
import { useAuth } from "@/context/AuthContext";
import { apiClient, toUserMessage } from "@/services/apiClient";
import { createId } from "@/lib/id";
import { sumEntries, toDateKey } from "@/services/foodLog/calculations";
import type {
  DailyTotals,
  FoodLogCreateInput,
  FoodLogEntry,
  FoodLogUpdateInput,
  WaterEntry,
} from "@/services/foodLog/types";

type LoadStatus = "idle" | "loading" | "ready" | "error";

interface DayPayload {
  date: string;
  entries: FoodLogEntry[];
  totals: DailyTotals;
  water: { entries: WaterEntry[]; totalMl: number; targetMl: number };
  favoriteIds: string[];
  recentIds: string[];
}

type Result<T = void> = { ok: true; data: T } | { ok: false; message: string };

interface DayLogContextValue {
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  isToday: boolean;
  status: LoadStatus;
  error: string | null;
  reload: () => Promise<void>;

  entries: FoodLogEntry[];
  totals: DailyTotals;

  water: WaterEntry[];
  waterTotalMl: number;
  waterTargetMl: number;

  favoriteIds: string[];
  recentIds: string[];
  isFavorite: (foodId: string) => boolean;
  toggleFavorite: (foodId: string) => Promise<Result>;

  addEntry: (input: Omit<FoodLogCreateInput, "clientId">) => Promise<Result<FoodLogEntry>>;
  updateEntry: (id: number, patch: FoodLogUpdateInput) => Promise<Result<FoodLogEntry>>;
  deleteEntry: (id: number) => Promise<Result>;

  addWater: (amountMl: number, date?: string) => Promise<Result<WaterEntry>>;
  updateWater: (id: number, amountMl: number) => Promise<Result<WaterEntry>>;
  deleteWater: (id: number) => Promise<Result>;
  setWaterTarget: (targetMl: number) => Promise<Result>;

  /** Bumps whenever any entry changes, so history views can refetch. */
  revision: number;
}

const DayLogContext = createContext<DayLogContextValue | null>(null);

const EMPTY_TOTALS: DailyTotals = { calories: 0, protein: 0, carbohydrates: 0, fat: 0, fiber: null };

export function DayLogProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [selectedDate, setSelectedDateState] = useState<string>(() => toDateKey());
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<FoodLogEntry[]>([]);
  const [water, setWater] = useState<WaterEntry[]>([]);
  const [waterTargetMl, setWaterTargetMl] = useState<number>(2500);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);
  const requestSeq = useRef(0);

  const load = useCallback(
    async (date: string) => {
      if (!user) return;
      const seq = ++requestSeq.current;
      setStatus("loading");
      setError(null);
      try {
        const data = await apiClient.get<DayPayload>(`/api/day?date=${encodeURIComponent(date)}`);
        if (seq !== requestSeq.current) return; // a newer date was requested
        setEntries(data.entries);
        setWater(data.water.entries);
        setWaterTargetMl(data.water.targetMl);
        setFavoriteIds(data.favoriteIds);
        setRecentIds(data.recentIds);
        setStatus("ready");
      } catch (err) {
        if (seq !== requestSeq.current) return;
        setStatus("error");
        setError(toUserMessage(err, "Could not load your day."));
      }
    },
    [user],
  );

  // Load whenever the user or the selected date changes; clear on sign-out.
  useEffect(() => {
    if (!user) {
      requestSeq.current += 1;
      const task = setTimeout(() => {
        setEntries([]);
        setWater([]);
        setFavoriteIds([]);
        setRecentIds([]);
        setStatus("idle");
      }, 0);
      return () => clearTimeout(task);
    }
    const task = setTimeout(() => void load(selectedDate), 0);
    return () => clearTimeout(task);
  }, [user, selectedDate, load]);

  const setSelectedDate = useCallback((date: string) => {
    setSelectedDateState(date);
  }, []);

  const reload = useCallback(() => load(selectedDate), [load, selectedDate]);

  const bump = useCallback(() => setRevision((value) => value + 1), []);

  /* ------------------------------ food ------------------------------ */

  const addEntry = useCallback<DayLogContextValue["addEntry"]>(
    async (input) => {
      try {
        const { entry } = await apiClient.post<{ entry: FoodLogEntry }>("/api/food-logs", {
          ...input,
          clientId: createId("log"),
        });
        if (entry.logDate === selectedDate) {
          setEntries((current) =>
            current.some((item) => item.id === entry.id) ? current : sortEntries([...current, entry]),
          );
        }
        setRecentIds((current) => [entry.foodId, ...current.filter((id) => id !== entry.foodId)].slice(0, 12));
        bump();
        return { ok: true, data: entry };
      } catch (err) {
        return { ok: false, message: toUserMessage(err, "Could not save the food entry.") };
      }
    },
    [selectedDate, bump],
  );

  const updateEntry = useCallback<DayLogContextValue["updateEntry"]>(
    async (id, patch) => {
      try {
        const { entry } = await apiClient.patch<{ entry: FoodLogEntry }>(`/api/food-logs/${id}`, patch);
        setEntries((current) => {
          const without = current.filter((item) => item.id !== id);
          return entry.logDate === selectedDate ? sortEntries([...without, entry]) : without;
        });
        bump();
        return { ok: true, data: entry };
      } catch (err) {
        return { ok: false, message: toUserMessage(err, "Could not update the food entry.") };
      }
    },
    [selectedDate, bump],
  );

  const deleteEntry = useCallback<DayLogContextValue["deleteEntry"]>(
    async (id) => {
      const snapshot = entries;
      setEntries((current) => current.filter((item) => item.id !== id));
      try {
        await apiClient.delete(`/api/food-logs/${id}`);
        bump();
        return { ok: true, data: undefined };
      } catch (err) {
        setEntries(snapshot);
        return { ok: false, message: toUserMessage(err, "Could not delete the food entry.") };
      }
    },
    [entries, bump],
  );

  /* ---------------------------- favourites --------------------------- */

  const isFavorite = useCallback((foodId: string) => favoriteIds.includes(foodId), [favoriteIds]);

  const toggleFavorite = useCallback<DayLogContextValue["toggleFavorite"]>(
    async (foodId) => {
      const wasFavorite = favoriteIds.includes(foodId);
      setFavoriteIds((current) =>
        wasFavorite ? current.filter((id) => id !== foodId) : [foodId, ...current],
      );
      try {
        if (wasFavorite) await apiClient.delete(`/api/food-favorites/${encodeURIComponent(foodId)}`);
        else await apiClient.put(`/api/food-favorites/${encodeURIComponent(foodId)}`);
        return { ok: true, data: undefined };
      } catch (err) {
        setFavoriteIds((current) =>
          wasFavorite ? [foodId, ...current] : current.filter((id) => id !== foodId),
        );
        return { ok: false, message: toUserMessage(err, "Could not update your favourites.") };
      }
    },
    [favoriteIds],
  );

  /* ------------------------------ water ------------------------------ */

  const addWater = useCallback<DayLogContextValue["addWater"]>(
    async (amountMl, date) => {
      const target = date ?? selectedDate;
      try {
        const { entry } = await apiClient.post<{ entry: WaterEntry }>("/api/water", {
          date: target,
          amountMl,
        });
        if (target === selectedDate) setWater((current) => [...current, entry]);
        return { ok: true, data: entry };
      } catch (err) {
        return { ok: false, message: toUserMessage(err, "Could not save the water entry.") };
      }
    },
    [selectedDate],
  );

  const updateWater = useCallback<DayLogContextValue["updateWater"]>(async (id, amountMl) => {
    try {
      const { entry } = await apiClient.patch<{ entry: WaterEntry }>(`/api/water/${id}`, { amountMl });
      setWater((current) => current.map((item) => (item.id === id ? entry : item)));
      return { ok: true, data: entry };
    } catch (err) {
      return { ok: false, message: toUserMessage(err, "Could not update the water entry.") };
    }
  }, []);

  const deleteWater = useCallback<DayLogContextValue["deleteWater"]>(
    async (id) => {
      const snapshot = water;
      setWater((current) => current.filter((item) => item.id !== id));
      try {
        await apiClient.delete(`/api/water/${id}`);
        return { ok: true, data: undefined };
      } catch (err) {
        setWater(snapshot);
        return { ok: false, message: toUserMessage(err, "Could not remove the water entry.") };
      }
    },
    [water],
  );

  const setWaterTarget = useCallback<DayLogContextValue["setWaterTarget"]>(async (targetMl) => {
    try {
      const data = await apiClient.put<{ targetMl: number }>("/api/water/target", { targetMl });
      setWaterTargetMl(data.targetMl);
      return { ok: true, data: undefined };
    } catch (err) {
      return { ok: false, message: toUserMessage(err, "Could not save your water target.") };
    }
  }, []);

  /* ----------------------------- derived ----------------------------- */

  const totals = useMemo(() => (entries.length ? sumEntries(entries) : EMPTY_TOTALS), [entries]);
  const waterTotalMl = useMemo(() => water.reduce((sum, entry) => sum + entry.amountMl, 0), [water]);
  const isToday = selectedDate === toDateKey();

  const value = useMemo<DayLogContextValue>(
    () => ({
      selectedDate,
      setSelectedDate,
      isToday,
      status,
      error,
      reload,
      entries,
      totals,
      water,
      waterTotalMl,
      waterTargetMl,
      favoriteIds,
      recentIds,
      isFavorite,
      toggleFavorite,
      addEntry,
      updateEntry,
      deleteEntry,
      addWater,
      updateWater,
      deleteWater,
      setWaterTarget,
      revision,
    }),
    [
      selectedDate,
      setSelectedDate,
      isToday,
      status,
      error,
      reload,
      entries,
      totals,
      water,
      waterTotalMl,
      waterTargetMl,
      favoriteIds,
      recentIds,
      isFavorite,
      toggleFavorite,
      addEntry,
      updateEntry,
      deleteEntry,
      addWater,
      updateWater,
      deleteWater,
      setWaterTarget,
      revision,
    ],
  );

  return <DayLogContext.Provider value={value}>{children}</DayLogContext.Provider>;
}

function sortEntries(list: FoodLogEntry[]): FoodLogEntry[] {
  return [...list].sort((a, b) => {
    const ta = a.loggedTime ?? "99:99";
    const tb = b.loggedTime ?? "99:99";
    if (ta !== tb) return ta < tb ? -1 : 1;
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
  });
}

export function useDayLog(): DayLogContextValue {
  const context = useContext(DayLogContext);
  if (!context) throw new Error("useDayLog must be used within a DayLogProvider");
  return context;
}
