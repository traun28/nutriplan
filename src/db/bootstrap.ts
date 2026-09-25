/**
 * Database initialisation.
 *
 * A configured `DATABASE_URL` is only half the story: if the tables have never
 * been created, every query fails with `42P01 relation does not exist`, and the
 * repositories turn that into a 503 on every page. This module applies the
 * committed Drizzle migrations once per process, before the first request is
 * served (see `src/instrumentation.ts`). Migrations use the direct Neon URL,
 * while the application queries continue to use the pooled runtime URL.
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
 * It never fabricates data or hides a real outage: if the database cannot be
 * reached or migrated, the outcome is recorded and reported by `/api/health`.
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

/** Keep schema changes off the pooled runtime connection when Neon provides a direct URL. */
const unpooledUrl = process.env.DATABASE_URL_UNPOOLED?.trim() || undefined;

async function runMigrations(): Promise<void> {
  const migrationUrl = unpooledUrl || process.env.DATABASE_URL?.trim();
  if (!migrationUrl) throw new Error("No database URL is configured for migrations.");

  if (!unpooledUrl && process.env.NODE_ENV === "production") {
    console.warn("[db] DATABASE_URL_UNPOOLED is unset; migrations are falling back to DATABASE_URL. Configure a direct URL for concurrent serverless starts.");
  }

  // One short-lived, dedicated connection per boot (not per request). Drizzle's
  // schema creation, journal lookup and transaction must all use this client.
  const client = new Client({
    connectionString: migrationUrl,
    connectionTimeoutMillis: 30_000,
    application_name: "nutriplan-migrations",
  });
  client.on("error", (error) => {
    console.error("[db] migration connection error:", describeDatabaseError(error));
  });

  try {
    await client.connect();
    if (unpooledUrl) {
      // A direct connection holds this session lock until end(), serialising
      // concurrent Vercel cold starts before Drizzle checks its migration journal.
      // A transaction-pooler cannot guarantee session affinity, so only lock
      // when the direct connection is configured.
      await client.query("SELECT pg_advisory_lock(hashtext('nutriplan'), hashtext('drizzle_migrations'))");
    }
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await client.end(); // releases the advisory lock even if migration fails
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
let retrying: Promise<DatabaseState> | null = null;

/** Outcome of the most recent initialisation attempt. */
export function databaseStatus(): DatabaseState {
  return status;
}

export function isDatabaseReady(): boolean {
  return status.state === "ready";
}

/**
 * Translates a driver error into an accurate, non-sensitive reason. Use the
 * innermost cause (not Drizzle's SQL wrapper) and never echo connection URLs.
 */
export function describeDatabaseError(error: unknown): string {
  const code = pickCode(error);
  const message = safeErrorMessage(error);

  switch (code) {
    case "42P01":
      return "The database schema has not been created yet.";
    case "3D000":
      return "The configured database does not exist.";
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

function safeErrorMessage(error: unknown, depth = 0): string {
  if (error && typeof error === "object") {
    const candidate = error as { message?: unknown; cause?: unknown };
    if (candidate.cause && depth < 4) return safeErrorMessage(candidate.cause, depth + 1);
    error = candidate.message;
  }
  if (typeof error !== "string") return "";
  return error
    .replace(/\bpostgres(?:ql)?:\/\/[^\s'"<>]+/gi, "[redacted database URL]")
    .replace(/\bpassword\s*[:=]\s*[^\s,;]+/gi, "password=[redacted]");
}

/**
 * Applies pending migrations and verifies the schema is queryable.
 * Safe to call repeatedly; the first call does the work.
 */
export function initialiseDatabase(): Promise<DatabaseState> {
  if (!initialising) initialising = runInitialisation();
  return initialising;
}

/** Retry a failed boot without racing an in-flight migration or opening more clients. */
export function reinitialiseDatabase(): Promise<DatabaseState> {
  if (retrying) return retrying;
  retrying = (async () => {
    const previous = initialising ? await initialising : null;
    if (previous?.state === "ready") return previous;
    initialising = null;
    return initialiseDatabase();
  })().finally(() => {
    retrying = null;
  });
  return retrying;
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
        detail: "The database is reachable but contains no tables. Check the committed migrations and DB_AUTO_MIGRATE setting.",
      };
      console.error(`[db] ${status.detail}`);
      return status;
    }

    status = { state: "ready", detail: `Connected; ${tables} table(s) present.`, tables };
    return status;
  } catch (error) {
    status = { state: "unavailable", detail: describeDatabaseError(error) };
    // Report the underlying cause without logging connection strings or SQL.
    console.error("[db] initialisation failed:", status.detail);
    return status;
  }
}
