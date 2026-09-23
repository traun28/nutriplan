-- Baseline schema for NutriPlan.
--
-- `IF NOT EXISTS` is deliberate. This migration has to be safe to apply to a
-- database whose tables were already created by `drizzle-kit push` (the setup
-- step documented in the README) — without it the boot-time migrator fails
-- with 42P07 "relation already exists" and every page reports the database as
-- unavailable even though it is perfectly healthy. With it, applying this file
-- is idempotent on an empty database, a pushed database, a partly-created one
-- and an already-migrated one.
--
-- Keep this file to CREATE-only statements. Later migrations that ALTER or
-- DROP must not be made idempotent this way; they are applied once and
-- recorded by Drizzle in the usual manner.

CREATE TABLE IF NOT EXISTS "ai_conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text DEFAULT 'New conversation' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"file_name" text NOT NULL,
	"display_name" text NOT NULL,
	"kind" text NOT NULL,
	"mime_type" text DEFAULT '' NOT NULL,
	"file_size_bytes" integer DEFAULT 0 NOT NULL,
	"content_hash" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'ready_for_review' NOT NULL,
	"status_detail" text DEFAULT '' NOT NULL,
	"extraction" jsonb,
	"kept_as_reference" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dataset_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"dataset_id" integer NOT NULL,
	"row_index" integer NOT NULL,
	"data" jsonb NOT NULL,
	"quality_status" text DEFAULT 'clean' NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"calories" real,
	"protein" real,
	"age" real,
	"height_cm" real,
	"weight_kg" real,
	"activity_level" text,
	"participant_id" text,
	"name" text,
	"gender" text,
	"bmi" real,
	"record_status" text,
	"nutrition_status" text,
	"reviewed" boolean DEFAULT false,
	"reviewed_at" timestamp with time zone,
	"excluded" boolean DEFAULT false,
	"review_note" text,
	"edited_at" timestamp with time zone,
	"edit_history" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "datasets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"file_name" text NOT NULL,
	"display_name" text NOT NULL,
	"kind" text NOT NULL,
	"mime_type" text DEFAULT '' NOT NULL,
	"file_size_bytes" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"status_detail" text DEFAULT '' NOT NULL,
	"record_count" integer DEFAULT 0 NOT NULL,
	"imported" boolean DEFAULT false NOT NULL,
	"columns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"quality" jsonb,
	"statistics" jsonb,
	"preview_rows" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"validation" jsonb,
	"column_mapping" jsonb,
	"imported_rows" integer,
	"rejected_rows" integer,
	"staged_table" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "diet_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "food_favorites" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"food_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "food_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"log_date" text NOT NULL,
	"meal_type" text NOT NULL,
	"food_id" text NOT NULL,
	"food_name" text NOT NULL,
	"servings" real NOT NULL,
	"portion_label" text DEFAULT '' NOT NULL,
	"calories" real NOT NULL,
	"protein_grams" real NOT NULL,
	"carbohydrate_grams" real NOT NULL,
	"fat_grams" real NOT NULL,
	"fiber_grams" real,
	"logged_time" text,
	"client_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "grocery_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"list_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"quantity" real,
	"unit" text,
	"required_quantity" real,
	"pantry_quantity" real,
	"pantry_uncomparable" boolean DEFAULT false NOT NULL,
	"unquantified" boolean DEFAULT false NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_custom" boolean DEFAULT false NOT NULL,
	"purchased" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "grocery_lists" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"meal_plan_id" integer,
	"day_indexes" jsonb,
	"generated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meal_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"start_date" text,
	"is_current" boolean DEFAULT false NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pantry_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"quantity" real,
	"unit" text,
	"expires_on" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "processed_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "progress_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"entry_date" text NOT NULL,
	"weight_kg" real NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recipe_favorites" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"recipe_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"full_name" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "water_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"log_date" text NOT NULL,
	"amount_ml" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_conversations_user_idx" ON "ai_conversations" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_messages_conversation_idx" ON "ai_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dataset_records_dataset_row_idx" ON "dataset_records" USING btree ("dataset_id","row_index");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dataset_records_dataset_status_idx" ON "dataset_records" USING btree ("dataset_id","record_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dataset_records_dataset_pid_idx" ON "dataset_records" USING btree ("dataset_id","participant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "diet_plans_user_unique" ON "diet_plans" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "food_favorites_user_food_unique" ON "food_favorites" USING btree ("user_id","food_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "food_logs_user_date_idx" ON "food_logs" USING btree ("user_id","log_date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "food_logs_user_client_unique" ON "food_logs" USING btree ("user_id","client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grocery_items_list_idx" ON "grocery_items" USING btree ("list_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "grocery_lists_user_unique" ON "grocery_lists" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meal_plans_user_idx" ON "meal_plans" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pantry_items_user_idx" ON "pantry_items" USING btree ("user_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "processed_user_unique" ON "processed_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "profiles_user_unique" ON "profiles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "progress_entries_user_date_unique" ON "progress_entries" USING btree ("user_id","entry_date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "recipe_favorites_user_recipe_unique" ON "recipe_favorites" USING btree ("user_id","recipe_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sessions_token_unique" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_settings_user_unique" ON "user_settings" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "water_logs_user_date_idx" ON "water_logs" USING btree ("user_id","log_date");