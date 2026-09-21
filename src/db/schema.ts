/**
 * Part 15 — persistent storage (PostgreSQL via Drizzle).
 *
 * Replaces browser-only state so the application works identically in
 * development and in the external/production deployment, and so data
 * survives a refresh across devices.
 */
import {
  boolean,
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
