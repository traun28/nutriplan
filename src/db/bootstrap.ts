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
 * cannot be reached or migrated, the outcome is recorded and surfaced verbatim
 * by `/api/health` and by the API error messages.
 */
import path from "node:path";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { db, hasDatabase } from "@/db";

/** Migration SQL committed in `/drizzle`; generated with `npm run db:generate`. */
const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

/** Set `DB_AUTO_MIGRATE=false` to boot without touching the schema. */
const autoMigrate = process.env.DB_AUTO_MIGRATE?.trim().toLowerCase() !== "false";

async function runMigrations(): Promise<void> {
  const directUrl = process.env.DATABASE_URL_UNPOOLED?.trim();
  const migrationUrl = directUrl || process.env.DATABASE_URL?.trim();
  if (!migrationUrl) throw new Error("No database URL is configured for migrations.");

  // Keep DDL off the pooled runtime client; close this connection after boot.
  const client = new Client({ connectionString: migrationUrl, connectionTimeoutMillis: 30_000 });
  client.on("error", () => console.error("[db] migration connection lost."));
  try {
    await client.connect();
    if (directUrl) {
      // Direct connections hold a session lock across Drizzle's journal check
      // and migration transaction, serialising concurrent serverless cold starts.
      await client.query("SELECT pg_advisory_lock(hashtext('nutriplan'), hashtext('drizzle_migrations'))");
    }
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
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
  const message = error instanceof Error ? error.message : String(error);

  switch (code) {
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
      return message || "The database could not complete that request.";
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
  if (!initialising) initialising = runInitialisation();
  return initialising;
}

/** Forces a fresh attempt — used by `/api/health` when it is asked to re-check. */
export function reinitialiseDatabase(): Promise<DatabaseState> {
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
    const probe = (await db.execute(
      sql`select count(*)::int as tables
            from information_schema.tables
           where table_schema = 'public'`,
    )) as unknown as { rows?: { tables?: number }[] };

    const tables = probe.rows?.[0]?.tables ?? 0;
    if (tables === 0) {
      status = {
        state: "unavailable",
        detail: `The database is reachable but contains no tables. Run "npm run db:push" against ${redact(process.env.DATABASE_URL)}.`,
      };
      console.error(`[db] ${status.detail}`);
      return status;
    }

    status = { state: "ready", detail: `Connected; ${tables} table(s) present.`, tables };
    return status;
  } catch (error) {
    status = { state: "unavailable", detail: describeDatabaseError(error) };
    // Log the real error server-side — the client only ever sees `detail`.
    console.error("[db] initialisation failed:", error);
    return status;
  }
}

/** Removes credentials so a connection string can be quoted in a message. */
function redact(url: string | undefined): string {
  if (!url) return "(unset)";
  return url.replace(/\/\/[^@/]*@/, "//***:***@");
}
