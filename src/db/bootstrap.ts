/**
 * Database initialisation.
 *
 * A configured `DATABASE_URL` is only half the story: if the tables have never
 * been created, every query fails with `42P01 relation does not exist`, and the
 * repositories turn that into a 503 on every page. This module removes that
 * failure mode by applying the committed Drizzle migrations once per process,
 * before the first request is served (see `src/instrumentation.ts`).
 *
 * Migrations are idempotent, so this is safe on every boot and on every kind of
 * database it meets:
 *
 *   • empty                 → all tables are created;
 *   • created by `db:push`  → the baseline migration is CREATE … IF NOT EXISTS,
 *                             so every statement is a no-op and Drizzle simply
 *                             records it as applied (without that, the boot
 *                             would die on 42P07 "relation already exists");
 *   • partly created        → only the missing tables are added;
 *   • already migrated      → Drizzle finds its record and does nothing.
 *
 * It never fabricates data and never hides a real outage: if the database
 * cannot be reached or migrated, the outcome is recorded and surfaced safely
 * by `/api/health` and by the API error messages.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { db, hasDatabase } from "@/db";
import { logDatabaseError } from "@/db/errors";

/** Migration SQL committed in `/drizzle`; generated with `npm run db:generate`. */
const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

/** Set `DB_AUTO_MIGRATE=false` to boot without touching the schema. */
const autoMigrate = process.env.DB_AUTO_MIGRATE?.trim().toLowerCase() !== "false";

/**
 * Drizzle's migrator reads the folder through `fs` at runtime, so a path built
 * from `process.cwd()` cannot be followed by output file tracing. In a
 * serverless bundle that does not ship `./drizzle` (see `outputFileTracingIncludes`
 * in next.config.ts) `migrate()` would die with a bare "Can't find
 * meta/_journal.json file" — which says nothing about the real cause. Failing
 * here with an explicit, sanitised error keeps cold starts diagnosable.
 */
function assertMigrationsFolder(): void {
  const journal = path.join(MIGRATIONS_FOLDER, "meta", "_journal.json");
  if (!existsSync(MIGRATIONS_FOLDER) || !existsSync(journal)) {
    const error = new Error(
      "The drizzle migrations folder is missing from this deployment bundle, so the database schema cannot be created or verified.",
    ) as Error & { code?: string };
    error.code = "MIGRATIONS_FOLDER_MISSING";
    throw error;
  }
}

async function runMigrations(): Promise<void> {
  const directUrl = process.env.DATABASE_URL_UNPOOLED?.trim();
  const migrationUrl = directUrl || process.env.DATABASE_URL?.trim();
  if (!migrationUrl) throw new Error("No database URL is configured for migrations.");

  // Session advisory locks are unsafe through Neon's transaction pooler.
  // The fallback supports direct DATABASE_URLs (including local PostgreSQL).
  if (new URL(migrationUrl).hostname.includes("-pooler.")) {
    throw new Error("Bootstrap requires a direct DATABASE_URL_UNPOOLED connection.");
  }

  assertMigrationsFolder();

  // Keep DDL off the pooled runtime client; close this connection after boot.
  const client = new Client({
    connectionString: migrationUrl,
    connectionTimeoutMillis: 30_000,
    application_name: "nutriplan-migrations",
  });
  client.on("error", (error) => logDatabaseError("migration connection lost", error));
  try {
    await client.connect();
    await client.query("SET lock_timeout = '30s'");
    // Direct connections hold a session lock across Drizzle's journal check
    // and migration transaction, serialising concurrent serverless cold starts.
    await client.query("SELECT pg_advisory_lock(hashtext('nutriplan'), hashtext('drizzle_migrations'))");
    try {
      await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
    } catch (error) {
      // Surface the real migration failure (sanitised) instead of letting the
      // boot continue as if the schema had been applied.
      logDatabaseError("migration failed", error);
      throw error;
    }
  } finally {
    await client.end(); // also releases the advisory lock on failure
  }
}

export type DatabaseState =
  | { state: "not_configured"; detail: string }
  | { state: "ready"; detail: string; tables: number }
  | { state: "unavailable"; detail: string };

let status: DatabaseState = {
  state: hasDatabase ? "unavailable" : "not_configured",
  detail: hasDatabase
    ? "The database has not been initialised yet."
    : "DATABASE_URL is not set, so no database is configured.",
};

/** One initialisation per process; concurrent callers share the same promise. */
let initialising: Promise<DatabaseState> | null = null;
let inFlight = false;

/** Outcome of the most recent initialisation attempt. */
export function databaseStatus(): DatabaseState {
  return status;
}

export function isDatabaseReady(): boolean {
  return status.state === "ready";
}

/**
 * Translates a driver error into an accurate, non-sensitive reason. The raw
 * error is logged server-side so the real cause is always diagnosable.
 */
export function describeDatabaseError(error: unknown): string {
  const code = pickCode(error);

  switch (code) {
    case "MIGRATIONS_FOLDER_MISSING":
      return "This deployment bundle is missing the database migrations, so the schema could not be created.";
    case "42P01":
      return "The database schema has not been created yet.";
    case "3D000":
      return "The database named in DATABASE_URL does not exist.";
    case "28P01":
    case "28000":
      return "The database rejected the configured credentials.";
    case "ECONNREFUSED":
      return "The database server refused the connection.";
    case "ETIMEDOUT":
    case "57014":
      return "The database did not respond in time.";
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return "The database host could not be resolved.";
    case "53300":
    case "53301":
      return "The database has run out of available connections.";
    default:
      return "The database could not complete that request.";
  }
}

function pickCode(error: unknown, depth = 0): string | undefined {
  if (!error || typeof error !== "object" || depth > 4) return undefined;
  const candidate = error as { code?: unknown; cause?: unknown };
  if (typeof candidate.code === "string" && candidate.code) return candidate.code;
  return pickCode(candidate.cause, depth + 1);
}

/**
 * Applies pending migrations and verifies the schema is queryable.
 * Safe to call repeatedly; the first call does the work.
 */
export function initialiseDatabase(): Promise<DatabaseState> {
  if (!initialising) {
    inFlight = true;
    initialising = runInitialisation().finally(() => { inFlight = false; });
  }
  return initialising;
}

/** Forces a fresh attempt — used by `/api/health` when it is asked to re-check. */
export function reinitialiseDatabase(): Promise<DatabaseState> {
  if (inFlight) return initialiseDatabase();
  initialising = null;
  return initialiseDatabase();
}

async function runInitialisation(): Promise<DatabaseState> {
  if (!hasDatabase) {
    status = {
      state: "not_configured",
      detail:
        "DATABASE_URL is not set. Copy .env.example to .env, point it at a PostgreSQL database, and restart the server.",
    };
    console.warn(`[db] ${status.detail}`);
    return status;
  }

  try {
    if (autoMigrate) {
      await runMigrations();
    }

    // A real query proves the connection works and the schema is present.
    // Checking for `users` specifically matters: counting tables alone would
    // report "ready" for a database that has tables but not this app's schema.
    const probe = (await db.execute(
      sql`select count(*)::int as tables,
                 to_regclass('public.users') is not null as has_users
            from information_schema.tables
           where table_schema = 'public'`,
    )) as unknown as { rows?: { tables?: number; has_users?: boolean }[] };

    const tables = probe.rows?.[0]?.tables ?? 0;
    if (tables === 0) {
      status = {
        state: "unavailable",
        detail: "The database is reachable but contains no tables. Apply the database migrations.",
      };
      console.error(`[db] ${status.detail}`);
      return status;
    }
    if (probe.rows?.[0]?.has_users !== true) {
      status = {
        state: "unavailable",
        detail:
          "The database is reachable but the users table is missing, so the schema is not fully applied.",
      };
      console.error(`[db] ${status.detail}`);
      return status;
    }

    status = { state: "ready", detail: `Connected; ${tables} table(s) present.`, tables };
    return status;
  } catch (error) {
    status = { state: "unavailable", detail: describeDatabaseError(error) };
    // Log the real error server-side — the client only ever sees `detail`.
    logDatabaseError("initialisation failed", error);
    return status;
  }
}
