/**
 * Part 15 — persistent storage (PostgreSQL via Drizzle).
 *
 * Replaces browser-only state so the application works identically in
 * development and in the external/production deployment, and so data
 * survives a refresh across devices.
 */
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Authentication                                                      */
/* ------------------------------------------------------------------ */

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  /** scrypt hash — never a plain-text password. */
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("users_email_unique").on(table.email)]);

export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  /** Random opaque token; only its hash is compared server-side. */
  tokenHash: text("token_hash").notNull(),
  userId: integer("user_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("sessions_token_unique").on(table.tokenHash)]);

/* ------------------------------------------------------------------ */
/* User profile                                                        */
/* ------------------------------------------------------------------ */

export const profiles = pgTable("profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  /** Full UserProfile JSON (Parts 1–6 data model). */
  data: jsonb("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("profiles_user_unique").on(table.userId)]);

/** Processed nutrition targets (Part 6 output). */
export const processedProfiles = pgTable("processed_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  data: jsonb("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("processed_user_unique").on(table.userId)]);

/** Generated diet plan (Part 7/8 output). */
export const dietPlans = pgTable("diet_plans", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  data: jsonb("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("diet_plans_user_unique").on(table.userId)]);

/* ------------------------------------------------------------------ */
/* Datasets                                                            */
/* ------------------------------------------------------------------ */

export const datasets = pgTable("datasets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  fileName: text("file_name").notNull(),
  displayName: text("display_name").notNull(),
  kind: text("kind").notNull(),
  mimeType: text("mime_type").notNull().default(""),
  fileSizeBytes: integer("file_size_bytes").notNull().default(0),
  /**
   * uploaded | processing | ready | needs_review | failed | unsupported
   */
  status: text("status").notNull().default("processing"),
  statusDetail: text("status_detail").notNull().default(""),
  recordCount: integer("record_count").notNull().default(0),
  /** Imported into the reference dataset library. */
  imported: boolean("imported").notNull().default(false),
  /** Detected column names. */
  columns: jsonb("columns").$type<string[]>().notNull().default([]),
  /** Quality report + statistics. */
  quality: jsonb("quality"),
  statistics: jsonb("statistics"),
  /** Limited sample rows for preview (never the whole file in the list view). */
  previewRows: jsonb("preview_rows").$type<string[][]>().notNull().default([]),
  warnings: jsonb("warnings").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Normalised dataset records, stored for detail/analytics views. */
export const datasetRecords = pgTable("dataset_records", {
  id: serial("id").primaryKey(),
  datasetId: integer("dataset_id").notNull(),
  rowIndex: integer("row_index").notNull(),
  /** Normalised record (participantId, age, nutrition, meals …). */
  data: jsonb("data").notNull(),
  /** clean | needs_review | missing_value | parse_error | ambiguous */
  qualityStatus: text("quality_status").notNull().default("clean"),
  issues: jsonb("issues").$type<string[]>().notNull().default([]),
  calories: real("calories"),
  protein: real("protein"),
  age: real("age"),
  heightCm: real("height_cm"),
  weightKg: real("weight_kg"),
  activityLevel: text("activity_level"),
});

/* ------------------------------------------------------------------ */
/* Attachments                                                         */
/* ------------------------------------------------------------------ */

export const attachments = pgTable("attachments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  fileName: text("file_name").notNull(),
  displayName: text("display_name").notNull(),
  kind: text("kind").notNull(),
  mimeType: text("mime_type").notNull().default(""),
  fileSizeBytes: integer("file_size_bytes").notNull().default(0),
  contentHash: text("content_hash").notNull().default(""),
  status: text("status").notNull().default("ready_for_review"),
  statusDetail: text("status_detail").notNull().default(""),
  /** Extracted text + fields + tables + provenance (Parts 12/13 model). */
  extraction: jsonb("extraction"),
  keptAsReference: boolean("kept_as_reference").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Phase 2 — food logging, favourites, water                           */
/* ------------------------------------------------------------------ */

/**
 * One logged food entry. Nutrition values are snapshotted at save time
 * (scaled from the food database via the shared calculation helpers) so a
 * later change to the dataset never silently rewrites history.
 */
export const foodLogs = pgTable("food_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  /** Local calendar date "YYYY-MM-DD" as chosen by the user. */
  logDate: text("log_date").notNull(),
  /** MealId: breakfast | morningSnack | lunch | eveningSnack | dinner | otherSnacks */
  mealType: text("meal_type").notNull(),
  /** Stable id from FOOD_DATABASE. */
  foodId: text("food_id").notNull(),
  foodName: text("food_name").notNull(),
  /** Multiplier of the food's reference serving (e.g. 1.5). */
  servings: real("servings").notNull(),
  /** Human-readable portion, e.g. "1.5 bowl(s)". */
  portionLabel: text("portion_label").notNull().default(""),
  calories: real("calories").notNull(),
  proteinGrams: real("protein_grams").notNull(),
  carbohydrateGrams: real("carbohydrate_grams").notNull(),
  fatGrams: real("fat_grams").notNull(),
  /** Null when the dataset has no fibre figure for the food. */
  fiberGrams: real("fiber_grams"),
  /** "HH:MM" local time, null when not supplied. */
  loggedTime: text("logged_time"),
  /** Client-generated idempotency key — blocks accidental double submits. */
  clientId: text("client_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("food_logs_user_date_idx").on(table.userId, table.logDate),
  uniqueIndex("food_logs_user_client_unique").on(table.userId, table.clientId),
]);

/** Per-user favourite foods (never global). */
export const foodFavorites = pgTable("food_favorites", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  foodId: text("food_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("food_favorites_user_food_unique").on(table.userId, table.foodId)]);

/** Individual water entries; the daily total is a sum, never stored. */
export const waterLogs = pgTable("water_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  logDate: text("log_date").notNull(),
  amountMl: integer("amount_ml").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("water_logs_user_date_idx").on(table.userId, table.logDate)]);

/** Small per-user settings bag (currently: water target). */
export const userSettings = pgTable("user_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  data: jsonb("data").$type<{ waterTargetMl?: number }>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("user_settings_user_unique").on(table.userId)]);

/* ------------------------------------------------------------------ */
/* Phase 3 — 7-day meal plans                                          */
/* ------------------------------------------------------------------ */

/**
 * One saved weekly plan. Each day is a full Part 7 `DietPlan` (meals,
 * totals, validation) stored as JSON — the same shape `diet_plans` uses —
 * so the existing meal components and validators work unchanged.
 */
export const mealPlans = pgTable("meal_plans", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  /** Optional "YYYY-MM-DD" the plan's Day 1 is anchored to. */
  startDate: text("start_date"),
  /** Marks the plan the dashboard reads from; at most one per user. */
  isCurrent: boolean("is_current").notNull().default(false),
  /** WeeklyPlanData — days[], summary, provenance (see services/diet/weeklyPlanner). */
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("meal_plans_user_idx").on(table.userId, table.createdAt)]);

/* ------------------------------------------------------------------ */
/* Phase 4 — recipes, grocery lists, pantry                            */
/* ------------------------------------------------------------------ */

/** Saved (favourite) recipes. Recipes themselves are shared read-only data. */
export const recipeFavorites = pgTable("recipe_favorites", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  recipeId: text("recipe_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("recipe_favorites_user_recipe_unique").on(table.userId, table.recipeId)]);

/** One grocery list per user (regenerated in place; custom items preserved). */
export const groceryLists = pgTable("grocery_lists", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  /** Meal plan the list was generated from, if any. */
  mealPlanId: integer("meal_plan_id"),
  /** Day indexes included in the last generation (null = whole plan). */
  dayIndexes: jsonb("day_indexes").$type<number[] | null>(),
  generatedAt: timestamp("generated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("grocery_lists_user_unique").on(table.userId)]);

export const groceryItems = pgTable("grocery_items", {
  id: serial("id").primaryKey(),
  listId: integer("list_id").notNull(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull().default("other"),
  quantity: real("quantity"),
  unit: text("unit"),
  /** Requirement before pantry subtraction, for display. */
  requiredQuantity: real("required_quantity"),
  pantryQuantity: real("pantry_quantity"),
  pantryUncomparable: boolean("pantry_uncomparable").notNull().default(false),
  unquantified: boolean("unquantified").notNull().default(false),
  /** Meals/recipes that need this item. */
  sources: jsonb("sources").$type<{ dayIndex: number; dayLabel: string; mealLabel: string; recipeId: string; recipeName: string }[]>().notNull().default([]),
  isCustom: boolean("is_custom").notNull().default(false),
  purchased: boolean("purchased").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("grocery_items_list_idx").on(table.listId)]);

export const pantryItems = pgTable("pantry_items", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull().default("other"),
  quantity: real("quantity"),
  unit: text("unit"),
  /** "YYYY-MM-DD" when known. */
  expiresOn: text("expires_on"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("pantry_items_user_idx").on(table.userId, table.name)]);
