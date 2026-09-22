/**
 * Phase 4 — server-side repository for recipe favourites, the grocery
 * list and the pantry. Every query is scoped by the session user's id.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, hasDatabase } from "@/db";
import { groceryItems, groceryLists, pantryItems, recipeFavorites } from "@/db/schema";
import type { GeneratedGroceryItem, GrocerySource } from "@/services/grocery/groceryBuilder";
import type { GroceryUnit } from "@/services/grocery/units";

export class KitchenRepositoryError extends Error {
  status: number;
  constructor(message: string, status = 503) {
    super(message);
    this.name = "KitchenRepositoryError";
    this.status = status;
  }
}

const DB_UNAVAILABLE = "The database is not available right now. Please try again shortly.";

async function run<T>(work: () => Promise<T>): Promise<T> {
  if (!hasDatabase) throw new KitchenRepositoryError(DB_UNAVAILABLE, 503);
  try {
    return await work();
  } catch (error) {
    if (error instanceof KitchenRepositoryError) throw error;
    throw new KitchenRepositoryError(DB_UNAVAILABLE, 503);
  }
}

/* ------------------------------------------------------------------ */
/* Recipe favourites                                                   */
/* ------------------------------------------------------------------ */

export async function listRecipeFavoriteIds(userId: number): Promise<string[]> {
  return run(async () => {
    const rows = await db
      .select({ recipeId: recipeFavorites.recipeId })
      .from(recipeFavorites)
      .where(eq(recipeFavorites.userId, userId))
      .orderBy(desc(recipeFavorites.createdAt));
    return rows.map((r) => r.recipeId);
  });
}

export async function addRecipeFavorite(userId: number, recipeId: string): Promise<void> {
  return run(async () => {
    await db.insert(recipeFavorites).values({ userId, recipeId }).onConflictDoNothing();
  });
}

export async function removeRecipeFavorite(userId: number, recipeId: string): Promise<boolean> {
  return run(async () => {
    const rows = await db
      .delete(recipeFavorites)
      .where(and(eq(recipeFavorites.userId, userId), eq(recipeFavorites.recipeId, recipeId)))
      .returning({ id: recipeFavorites.id });
    return rows.length > 0;
  });
}

/* ------------------------------------------------------------------ */
/* Grocery list                                                        */
/* ------------------------------------------------------------------ */

export interface GroceryItemRecord {
  id: number;
  name: string;
  category: string;
  quantity: number | null;
  unit: GroceryUnit | null;
  requiredQuantity: number | null;
  pantryQuantity: number | null;
  pantryUncomparable: boolean;
  unquantified: boolean;
  sources: GrocerySource[];
  isCustom: boolean;
  purchased: boolean;
}

export interface GroceryListRecord {
  id: number;
  mealPlanId: number | null;
  dayIndexes: number[] | null;
  generatedAt: string | null;
  updatedAt: string;
  items: GroceryItemRecord[];
}

type ItemRow = typeof groceryItems.$inferSelect;

function toItem(row: ItemRow): GroceryItemRecord {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    quantity: row.quantity,
    unit: (row.unit as GroceryUnit | null) ?? null,
    requiredQuantity: row.requiredQuantity,
    pantryQuantity: row.pantryQuantity,
    pantryUncomparable: row.pantryUncomparable,
    unquantified: row.unquantified,
    sources: row.sources ?? [],
    isCustom: row.isCustom,
    purchased: row.purchased,
  };
}

async function ensureList(userId: number) {
  const existing = await db.select().from(groceryLists).where(eq(groceryLists.userId, userId)).limit(1);
  if (existing[0]) return existing[0];
  const rows = await db.insert(groceryLists).values({ userId }).returning();
  return rows[0];
}

export async function getGroceryList(userId: number): Promise<GroceryListRecord> {
  return run(async () => {
    const list = await ensureList(userId);
    const items = await db
      .select()
      .from(groceryItems)
      .where(and(eq(groceryItems.listId, list.id), eq(groceryItems.userId, userId)))
      .orderBy(asc(groceryItems.category), asc(groceryItems.name), asc(groceryItems.id));
    return {
      id: list.id,
      mealPlanId: list.mealPlanId,
      dayIndexes: list.dayIndexes ?? null,
      generatedAt: list.generatedAt?.toISOString() ?? null,
      updatedAt: list.updatedAt.toISOString(),
      items: items.map(toItem),
    };
  });
}

/**
 * Replaces the generated items with a fresh set. Custom items are kept;
 * a generated item that already exists with the same name+unit keeps its
 * purchased flag so re-generation does not undo the user's shopping.
 */
export async function replaceGeneratedItems(
  userId: number,
  input: { mealPlanId: number; dayIndexes: number[] | null; items: GeneratedGroceryItem[] },
): Promise<GroceryListRecord> {
  return run(async () => {
    const list = await ensureList(userId);
    const previous = await db
      .select({ name: groceryItems.name, unit: groceryItems.unit, purchased: groceryItems.purchased })
      .from(groceryItems)
      .where(and(eq(groceryItems.listId, list.id), eq(groceryItems.isCustom, false)));
    const purchasedBefore = new Set(previous.filter((p) => p.purchased).map((p) => `${p.name}::${p.unit ?? ""}`));

    await db.delete(groceryItems).where(and(eq(groceryItems.listId, list.id), eq(groceryItems.userId, userId), eq(groceryItems.isCustom, false)));
    if (input.items.length > 0) {
      await db.insert(groceryItems).values(
        input.items.map((item) => ({
          listId: list.id,
          userId,
          name: item.name,
          category: item.category,
          quantity: item.quantity,
          unit: item.unit,
          requiredQuantity: item.requiredQuantity,
          pantryQuantity: item.pantryQuantity,
          pantryUncomparable: item.pantryUncomparable,
          unquantified: item.partiallyUnquantified,
          sources: item.sources,
          isCustom: false,
          purchased: purchasedBefore.has(`${item.name}::${item.unit ?? ""}`),
        })),
      );
    }
    await db
      .update(groceryLists)
      .set({ mealPlanId: input.mealPlanId, dayIndexes: input.dayIndexes, generatedAt: new Date(), updatedAt: new Date() })
      .where(eq(groceryLists.id, list.id));
    return getGroceryList(userId);
  });
}

export async function addGroceryItems(
  userId: number,
  items: { name: string; category: string; quantity: number | null; unit: GroceryUnit | null; sources?: GrocerySource[] }[],
): Promise<GroceryListRecord> {
  return run(async () => {
    const list = await ensureList(userId);
    if (items.length > 0) {
      await db.insert(groceryItems).values(
        items.map((item) => ({
          listId: list.id,
          userId,
          name: item.name,
          category: item.category,
          quantity: item.quantity,
          unit: item.unit,
          requiredQuantity: item.quantity,
          sources: item.sources ?? [],
          isCustom: true,
        })),
      );
      await db.update(groceryLists).set({ updatedAt: new Date() }).where(eq(groceryLists.id, list.id));
    }
    return getGroceryList(userId);
  });
}

export async function updateGroceryItem(
  userId: number,
  id: number,
  patch: { purchased?: boolean; quantity?: number | null; unit?: GroceryUnit | null; name?: string },
): Promise<GroceryItemRecord | null> {
  return run(async () => {
    const rows = await db
      .update(groceryItems)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(groceryItems.id, id), eq(groceryItems.userId, userId)))
      .returning();
    return rows[0] ? toItem(rows[0]) : null;
  });
}

export async function deleteGroceryItem(userId: number, id: number): Promise<boolean> {
  return run(async () => {
    const rows = await db
      .delete(groceryItems)
      .where(and(eq(groceryItems.id, id), eq(groceryItems.userId, userId)))
      .returning({ id: groceryItems.id });
    return rows.length > 0;
  });
}

export async function clearPurchasedItems(userId: number): Promise<number> {
  return run(async () => {
    const rows = await db
      .delete(groceryItems)
      .where(and(eq(groceryItems.userId, userId), eq(groceryItems.purchased, true)))
      .returning({ id: groceryItems.id });
    return rows.length;
  });
}

export async function setAllPurchased(userId: number, ids: number[], purchased: boolean): Promise<void> {
  return run(async () => {
    if (ids.length === 0) return;
    await db
      .update(groceryItems)
      .set({ purchased, updatedAt: new Date() })
      .where(and(eq(groceryItems.userId, userId), inArray(groceryItems.id, ids)));
  });
}

/* ------------------------------------------------------------------ */
/* Pantry                                                              */
/* ------------------------------------------------------------------ */

export interface PantryItemRecord {
  id: number;
  name: string;
  category: string;
  quantity: number | null;
  unit: GroceryUnit | null;
  expiresOn: string | null;
  notes: string | null;
  updatedAt: string;
}

type PantryRow = typeof pantryItems.$inferSelect;

function toPantry(row: PantryRow): PantryItemRecord {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    quantity: row.quantity,
    unit: (row.unit as GroceryUnit | null) ?? null,
    expiresOn: row.expiresOn,
    notes: row.notes,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listPantry(userId: number): Promise<PantryItemRecord[]> {
  return run(async () => {
    const rows = await db
      .select()
      .from(pantryItems)
      .where(eq(pantryItems.userId, userId))
      .orderBy(asc(pantryItems.category), asc(pantryItems.name));
    return rows.map(toPantry);
  });
}

export interface PantryWrite {
  name: string;
  category: string;
  quantity: number | null;
  unit: GroceryUnit | null;
  expiresOn: string | null;
  notes: string | null;
}

export async function createPantryItem(userId: number, input: PantryWrite): Promise<PantryItemRecord> {
  return run(async () => {
    const rows = await db.insert(pantryItems).values({ userId, ...input }).returning();
    return toPantry(rows[0]);
  });
}

export async function updatePantryItem(userId: number, id: number, patch: Partial<PantryWrite>): Promise<PantryItemRecord | null> {
  return run(async () => {
    const rows = await db
      .update(pantryItems)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(pantryItems.id, id), eq(pantryItems.userId, userId)))
      .returning();
    return rows[0] ? toPantry(rows[0]) : null;
  });
}

export async function deletePantryItem(userId: number, id: number): Promise<boolean> {
  return run(async () => {
    const rows = await db
      .delete(pantryItems)
      .where(and(eq(pantryItems.id, id), eq(pantryItems.userId, userId)))
      .returning({ id: pantryItems.id });
    return rows.length > 0;
  });
}
