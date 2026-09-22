"use client";

/**
 * Phase 4 — client cache for recipe favourites, the grocery list and the
 * pantry. Each collection is fetched lazily on first use and then kept in
 * memory, so pages never re-request the same data on re-render.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import { toUserMessage } from "@/services/apiClient";
import type { GroceryItemRecord, GroceryListRecord, PantryItemRecord } from "@/services/server/kitchenRepository";
import type { GroceryUnit } from "@/services/grocery/units";

export interface KitchenResult<T = void> {
  success: boolean;
  message: string;
  data?: T;
}

type Status = "idle" | "loading" | "ready" | "error";

interface KitchenContextValue {
  favoriteIds: string[] | null;
  loadFavorites: () => Promise<void>;
  isFavorite: (recipeId: string) => boolean;
  toggleFavorite: (recipeId: string) => Promise<KitchenResult>;

  grocery: GroceryListRecord | null;
  groceryStatus: Status;
  groceryError: string | null;
  loadGrocery: (force?: boolean) => Promise<void>;
  generateGrocery: (input: { dayIndexes?: number[] | null; usePantry?: boolean; mealPlanId?: number }) => Promise<KitchenResult<{ coveredByPantry: string[]; planName: string }>>;
  addGroceryItems: (items: { name: string; category?: string; quantity?: number | null; unit?: GroceryUnit | null }[]) => Promise<KitchenResult>;
  addRecipeToGrocery: (recipeId: string, servings?: number) => Promise<KitchenResult<{ added: number }>>;
  updateGroceryItem: (id: number, patch: { purchased?: boolean; quantity?: number | null; unit?: GroceryUnit | null; name?: string }) => Promise<KitchenResult>;
  deleteGroceryItem: (id: number) => Promise<KitchenResult>;
  clearPurchased: () => Promise<KitchenResult<{ removed: number }>>;

  pantry: PantryItemRecord[] | null;
  pantryStatus: Status;
  pantryError: string | null;
  loadPantry: (force?: boolean) => Promise<void>;
  addPantryItem: (input: Record<string, unknown>) => Promise<KitchenResult<PantryItemRecord>>;
  updatePantryItem: (id: number, patch: Record<string, unknown>) => Promise<KitchenResult<PantryItemRecord>>;
  deletePantryItem: (id: number) => Promise<KitchenResult>;

  busy: string | null;
}

const KitchenContext = createContext<KitchenContextValue | null>(null);

async function call<T>(path: string, init: RequestInit = {}): Promise<{ ok: true; data: T } | { ok: false; message: string; status: number }> {
  try {
    const response = await fetch(path, {
      ...init,
      headers: { "content-type": "application/json", ...(init.headers ?? {}) },
      credentials: "same-origin",
    });
    const text = await response.text();
    const payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    if (!response.ok) {
      return { ok: false, status: response.status, message: String(payload.error ?? "The request could not be completed.") };
    }
    return { ok: true, data: payload as T };
  } catch (error) {
    return { ok: false, status: 0, message: toUserMessage(error, "Could not reach the server. Check your connection and try again.") };
  }
}

export function KitchenProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [favoriteIds, setFavoriteIds] = useState<string[] | null>(null);
  const [grocery, setGrocery] = useState<GroceryListRecord | null>(null);
  const [groceryStatus, setGroceryStatus] = useState<Status>("idle");
  const [groceryError, setGroceryError] = useState<string | null>(null);
  const [pantry, setPantry] = useState<PantryItemRecord[] | null>(null);
  const [pantryStatus, setPantryStatus] = useState<Status>("idle");
  const [pantryError, setPantryError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef<string | null>(null);
  const loadedUser = useRef<number | null>(null);

  // Reset caches when the signed-in user changes (derived, not an effect).
  if (user?.id !== loadedUser.current) {
    loadedUser.current = user?.id ?? null;
    if (favoriteIds !== null) setFavoriteIds(null);
    if (grocery !== null) setGrocery(null);
    if (pantry !== null) setPantry(null);
    if (groceryStatus !== "idle") setGroceryStatus("idle");
    if (pantryStatus !== "idle") setPantryStatus("idle");
  }

  const guard = useCallback(async <T,>(key: string, work: () => Promise<KitchenResult<T>>): Promise<KitchenResult<T>> => {
    if (busyRef.current) return { success: false, message: "Please wait for the current action to finish." };
    busyRef.current = key;
    setBusy(key);
    try {
      return await work();
    } finally {
      busyRef.current = null;
      setBusy(null);
    }
  }, []);

  /* ---------------------------- favourites ---------------------------- */
  const loadFavorites = useCallback(async () => {
    if (!user) return;
    const r = await call<{ recipeIds: string[] }>("/api/recipe-favorites");
    setFavoriteIds(r.ok ? r.data.recipeIds : []);
  }, [user]);

  const isFavorite = useCallback((id: string) => favoriteIds?.includes(id) ?? false, [favoriteIds]);

  const toggleFavorite = useCallback(
    async (id: string): Promise<KitchenResult> => {
      if (!user) return { success: false, message: "Sign in to save recipes." };
      const wasFav = favoriteIds?.includes(id) ?? false;
      setFavoriteIds((ids) => (wasFav ? (ids ?? []).filter((x) => x !== id) : [id, ...(ids ?? [])]));
      const r = await call(`/api/recipe-favorites/${encodeURIComponent(id)}`, { method: wasFav ? "DELETE" : "PUT" });
      if (!r.ok) {
        setFavoriteIds((ids) => (wasFav ? [id, ...(ids ?? [])] : (ids ?? []).filter((x) => x !== id)));
        return { success: false, message: r.message };
      }
      return { success: true, message: wasFav ? "Removed from saved recipes." : "Recipe saved." };
    },
    [user, favoriteIds],
  );

  /* ------------------------------ grocery ------------------------------ */
  const loadGrocery = useCallback(
    async (force = false) => {
      if (!user) return;
      if (!force && (groceryStatus === "ready" || groceryStatus === "loading")) return;
      setGroceryStatus("loading");
      setGroceryError(null);
      const r = await call<{ list: GroceryListRecord }>("/api/grocery");
      if (r.ok) {
        setGrocery(r.data.list);
        setGroceryStatus("ready");
      } else {
        setGroceryError(r.message);
        setGroceryStatus("error");
      }
    },
    [user, groceryStatus],
  );

  const generateGrocery = useCallback<KitchenContextValue["generateGrocery"]>(
    (input) =>
      guard("grocery:generate", async () => {
        const r = await call<{ list: GroceryListRecord; coveredByPantry: string[]; planName: string }>("/api/grocery/generate", { method: "POST", body: JSON.stringify(input) });
        if (!r.ok) return { success: false, message: r.message };
        setGrocery(r.data.list);
        setGroceryStatus("ready");
        return { success: true, message: `Grocery list generated from “${r.data.planName}”.`, data: { coveredByPantry: r.data.coveredByPantry, planName: r.data.planName } };
      }),
    [guard],
  );

  const addGroceryItems = useCallback<KitchenContextValue["addGroceryItems"]>(
    (items) =>
      guard("grocery:add", async () => {
        const r = await call<{ list: GroceryListRecord }>("/api/grocery", { method: "POST", body: JSON.stringify({ items }) });
        if (!r.ok) return { success: false, message: r.message };
        setGrocery(r.data.list);
        setGroceryStatus("ready");
        return { success: true, message: items.length === 1 ? `Added ${items[0].name}.` : `Added ${items.length} items.` };
      }),
    [guard],
  );

  const addRecipeToGrocery = useCallback<KitchenContextValue["addRecipeToGrocery"]>(
    (recipeId, servings = 1) =>
      guard("grocery:recipe", async () => {
        const r = await call<{ list: GroceryListRecord; added: number }>("/api/grocery", { method: "POST", body: JSON.stringify({ recipeId, servings }) });
        if (!r.ok) return { success: false, message: r.message };
        setGrocery(r.data.list);
        setGroceryStatus("ready");
        return { success: true, message: `Added ${r.data.added} ingredients to your grocery list.`, data: { added: r.data.added } };
      }),
    [guard],
  );

  const updateGroceryItem = useCallback<KitchenContextValue["updateGroceryItem"]>(
    async (id, patch) => {
      // Optimistic for the purchased toggle so checkboxes feel instant.
      const previous = grocery;
      if (patch.purchased !== undefined && grocery) {
        setGrocery({ ...grocery, items: grocery.items.map((i) => (i.id === id ? { ...i, purchased: patch.purchased! } : i)) });
      }
      const r = await call<{ item: GroceryItemRecord }>(`/api/grocery/items/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      if (!r.ok) {
        if (previous) setGrocery(previous);
        return { success: false, message: r.message };
      }
      setGrocery((g) => (g ? { ...g, items: g.items.map((i) => (i.id === id ? r.data.item : i)) } : g));
      return { success: true, message: patch.purchased !== undefined ? (patch.purchased ? "Marked as purchased." : "Marked as not purchased.") : "Item updated." };
    },
    [grocery],
  );

  const deleteGroceryItem = useCallback<KitchenContextValue["deleteGroceryItem"]>(
    (id) =>
      guard(`grocery:delete:${id}`, async () => {
        const r = await call(`/api/grocery/items/${id}`, { method: "DELETE" });
        if (!r.ok) return { success: false, message: r.message };
        setGrocery((g) => (g ? { ...g, items: g.items.filter((i) => i.id !== id) } : g));
        return { success: true, message: "Item removed." };
      }),
    [guard],
  );

  const clearPurchased = useCallback<KitchenContextValue["clearPurchased"]>(
    () =>
      guard("grocery:clear", async () => {
        const r = await call<{ removed: number; list: GroceryListRecord }>("/api/grocery/clear-purchased", { method: "POST", body: "{}" });
        if (!r.ok) return { success: false, message: r.message };
        setGrocery(r.data.list);
        return { success: true, message: r.data.removed === 0 ? "Nothing to clear." : `Cleared ${r.data.removed} purchased item${r.data.removed === 1 ? "" : "s"}.`, data: { removed: r.data.removed } };
      }),
    [guard],
  );

  /* ------------------------------ pantry ------------------------------ */
  const loadPantry = useCallback(
    async (force = false) => {
      if (!user) return;
      if (!force && (pantryStatus === "ready" || pantryStatus === "loading")) return;
      setPantryStatus("loading");
      setPantryError(null);
      const r = await call<{ items: PantryItemRecord[] }>("/api/pantry");
      if (r.ok) {
        setPantry(r.data.items);
        setPantryStatus("ready");
      } else {
        setPantryError(r.message);
        setPantryStatus("error");
      }
    },
    [user, pantryStatus],
  );

  const addPantryItem = useCallback<KitchenContextValue["addPantryItem"]>(
    (input) =>
      guard("pantry:add", async () => {
        const r = await call<{ item: PantryItemRecord }>("/api/pantry", { method: "POST", body: JSON.stringify(input) });
        if (!r.ok) return { success: false, message: r.message };
        setPantry((p) => [...(p ?? []), r.data.item].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)));
        setPantryStatus("ready");
        return { success: true, message: `Added ${r.data.item.name} to your pantry.`, data: r.data.item };
      }),
    [guard],
  );

  const updatePantryItem = useCallback<KitchenContextValue["updatePantryItem"]>(
    (id, patch) =>
      guard(`pantry:update:${id}`, async () => {
        const r = await call<{ item: PantryItemRecord }>(`/api/pantry/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
        if (!r.ok) return { success: false, message: r.message };
        setPantry((p) => (p ?? []).map((i) => (i.id === id ? r.data.item : i)));
        return { success: true, message: "Pantry item updated.", data: r.data.item };
      }),
    [guard],
  );

  const deletePantryItem = useCallback<KitchenContextValue["deletePantryItem"]>(
    (id) =>
      guard(`pantry:delete:${id}`, async () => {
        const r = await call(`/api/pantry/${id}`, { method: "DELETE" });
        if (!r.ok) return { success: false, message: r.message };
        setPantry((p) => (p ?? []).filter((i) => i.id !== id));
        return { success: true, message: "Removed from your pantry." };
      }),
    [guard],
  );

  const value = useMemo<KitchenContextValue>(
    () => ({
      favoriteIds,
      loadFavorites,
      isFavorite,
      toggleFavorite,
      grocery,
      groceryStatus,
      groceryError,
      loadGrocery,
      generateGrocery,
      addGroceryItems,
      addRecipeToGrocery,
      updateGroceryItem,
      deleteGroceryItem,
      clearPurchased,
      pantry,
      pantryStatus,
      pantryError,
      loadPantry,
      addPantryItem,
      updatePantryItem,
      deletePantryItem,
      busy,
    }),
    [favoriteIds, loadFavorites, isFavorite, toggleFavorite, grocery, groceryStatus, groceryError, loadGrocery, generateGrocery, addGroceryItems, addRecipeToGrocery, updateGroceryItem, deleteGroceryItem, clearPurchased, pantry, pantryStatus, pantryError, loadPantry, addPantryItem, updatePantryItem, deletePantryItem, busy],
  );

  return <KitchenContext.Provider value={value}>{children}</KitchenContext.Provider>;
}

export function useKitchen(): KitchenContextValue {
  const context = useContext(KitchenContext);
  if (!context) throw new Error("useKitchen must be used within a KitchenProvider");
  return context;
}
