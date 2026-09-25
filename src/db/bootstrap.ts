/**
 * Database bootstrap for independent serverless instances.
 *
 * The Drizzle journal (drizzle.__drizzle_migrations), NOT an instance-local
 * "initialising" flag, is the cross-instance source of truth. A fast journal
 * read skips already-applied migrations. Otherwise a dedicated connection
 * acquires a transaction-scoped advisory lock, re-reads the journal, and
 * applies the pending Drizzle migration files and journal rows atomically.
 * Other instances poll the journal/lock for a bounded time; if the migrator
 * fails or disappears, PostgreSQL rolls back its transaction and releases the
 * lock so another instance can finish the work.
 *
 * Drizzle's node-postgres migrate() cannot be wrapped in an outer transaction:
 * it creates the journal table outside its own transaction, then issues its own
 * BEGIN/COMMIT. That COMMIT would release an outer pg_advisory_xact_lock. We
 * use Drizzle's readMigrationFiles() (including its SQL splitting and hashes)
 * and its existing journal format, but control the transaction ourselves.
 * No separate marker or session-level advisory lock is needed.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { readMigrationFiles, type MigrationMeta } from "drizzle-orm/migrator";
import { Client } from "pg";
import { db, hasDatabase } from "@/db";
import { logDatabaseError } from "@/db/errors";

/** Migration SQL committed in `/drizzle`; generated with `npm run db:generate`. */
const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

/** Set `DB_AUTO_MIGRATE=false` to boot without touching the schema. */
const autoMigrate = process.env.DB_AUTO_MIGRATE?.trim().toLowerCase() !== "false";

/** Keep the same key as previous deployments, including their session locks. */
const ADVISORY_LOCK_TRY_XACT =
  "SELECT pg_try_advisory_xact_lock(hashtext('nutriplan'), hashtext('drizzle_migrations')) AS acquired";

/** Bound waiting for a peer, not the lifetime of the migration itself. */
const LOCK_WAIT_BUDGET_MS = parseNonNegativeMs(process.env.DB_BOOTSTRAP_LOCK_WAIT_MS, 8_000);
const LOCK_POLL_INTERVAL_MS = 500;

function parseNonNegativeMs(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/** Fail clearly if output tracing omitted the committed migration files. */
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

/** Drizzle itself compares the newest journal `created_at` to `folderMillis`. */
async function latestAppliedMigration(client: Client): Promise<number | null> {
  // A missing schema/table is normal on a fresh DB. to_regclass avoids a
  // 42P01 error (and, more importantly, an aborted transaction) in that case.
  const exists = await client.query<{ journal: string | null }>(
    "SELECT to_regclass('drizzle.__drizzle_migrations') AS journal",
  );
  if (!exists.rows[0]?.journal) return null;

  const result = await client.query<{ latest: string | null }>(
    'SELECT max(created_at) AS latest FROM "drizzle"."__drizzle_migrations"',
  );
  const latest = result.rows[0]?.latest;
  return latest === null || latest === undefined ? null : Number(latest);
}

async function allLocalMigrationsApplied(client: Client, newest: number): Promise<boolean> {
  const latest = await latestAppliedMigration(client);
  return latest !== null && latest >= newest;
}

/**
 * Run the SQL and journal updates in the SAME transaction as the lock.
 * These are Drizzle's own journal schema, SQL chunks and hashes. Creating the
 * journal under the lock also makes the initial empty-database bootstrap
 * atomic: a failed/abandoned migration leaves neither tables nor a false
 * completion record behind.
 */
async function applyPendingMigrations(client: Client, migrations: MigrationMeta[]): Promise<number> {
  await client.query('CREATE SCHEMA IF NOT EXISTS "drizzle"');
  await client.query(`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);

  const latest = await latestAppliedMigration(client);
  let applied = 0;
  for (const migration of migrations) {
    if (latest === null || latest < migration.folderMillis) {
      for (const statement of migration.sql) {
        await client.query(statement);
      }
      await client.query(
        'INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ($1, $2)',
        [migration.hash, migration.folderMillis],
      );
      applied++;
    }
  }
  return applied;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function busyError(): Error & { code: string } {
  const error = new Error(
    "The migration lock is held, but the Drizzle journal does not yet record completion; this attempt stopped waiting after its bounded budget.",
  ) as Error & { code: string };
  error.code = "DB_BOOTSTRAP_BUSY";
  return error;
}

async function runMigrations(): Promise<void> {
  const migrationUrl = process.env.DATABASE_URL_UNPOOLED?.trim() || process.env.DATABASE_URL?.trim();
  if (!migrationUrl) throw new Error("No database URL is configured for migrations.");

  assertMigrationsFolder();
  const migrations = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER });
  const newest = Math.max(0, ...migrations.map((migration) => migration.folderMillis));

  // Never use the runtime pool (src/db/index.ts, DATABASE_URL) for DDL. With
  // an unpooled URL this is a direct connection; the DATABASE_URL fallback
  // also works through a transaction pooler, which pins a backend for BEGIN
  // through COMMIT. No session-level setting or lock needs to survive it.
  const client = new Client({
    connectionString: migrationUrl,
    connectionTimeoutMillis: 10_000,
    query_timeout: 35_000, // also bound a hung preflight/COMMIT at the client
    application_name: "nutriplan-migrations",
  });
  client.on("error", (error) => logDatabaseError("migration connection lost", error));

  try {
    await client.connect();
    if (await allLocalMigrationsApplied(client, newest)) return;

    const deadline = performance.now() + LOCK_WAIT_BUDGET_MS;
    for (;;) {
      await client.query("BEGIN");
      let transactionOpen = true;
      try {
        // SET LOCAL is tied to THIS transaction/backend, even if the fallback
        // DATABASE_URL goes through a transaction pooler. PostgreSQL kills an
        // abandoned idle transaction (e.g. a frozen Vercel process) and thus
        // releases its lock without depending on application finally blocks.
        await client.query("SET LOCAL lock_timeout = '10s'");
        await client.query("SET LOCAL statement_timeout = '30s'");
        await client.query("SET LOCAL idle_in_transaction_session_timeout = '15s'");
        const lock = await client.query<{ acquired: boolean }>(ADVISORY_LOCK_TRY_XACT);
        if (lock.rows[0]?.acquired === true) {
          // Another instance may have committed between our preflight and
          // taking the lock. Only the lock holder reads/writes the journal.
          console.log("[db] migration transaction lock acquired; checking Drizzle journal");
          let applied: number;
          try {
            applied = await applyPendingMigrations(client, migrations);
          } catch (error) {
            logDatabaseError("migration failed", error);
            const failure = new Error("The database migration failed.", { cause: error }) as Error & { code: string };
            failure.code = "DB_MIGRATION_FAILED";
            throw failure;
          }
          await client.query("COMMIT"); // journal and schema become visible together
          transactionOpen = false;
          console.log(`[db] Drizzle journal committed; ${applied} migration(s) applied`);
          return;
        }
        await client.query("ROLLBACK"); // release this attempt's transaction
        transactionOpen = false;
      } catch (error) {
        if (transactionOpen) {
          await client.query("ROLLBACK").catch((rollbackError) =>
            logDatabaseError("migration rollback failed", rollbackError),
          );
        }
        throw error;
      }

      // Never assume a process-local failure/busy flag reflects other servers.
      // A peer may have committed, or failed and released its lock. Retry the
      // journal and lock, but do not keep a request waiting indefinitely.
      if (await allLocalMigrationsApplied(client, newest)) return;
      if (performance.now() >= deadline) throw busyError();
      await sleep(Math.max(0, Math.min(LOCK_POLL_INTERVAL_MS, deadline - performance.now())));
    }
  } finally {
    // Also runs on connection/statement/COMMIT failure. An explicit rollback
    // normally releases the transaction lock; end() is the final guarantee.
    await client.end().catch((error) => logDatabaseError("closing migration connection failed", error));
  }
}

export type DatabaseState =
  | { state: "not_configured"; detail: string }
  | { state: "ready"; detail: string; tables: number }
  | { state: "unavailable"; detail: string };

/**
 * Process-local optimisations ONLY: share concurrent calls in this process
 * and avoid re-probing an already verified schema. A very short debounce
 * after a failed attempt prevents instrumentation.register() and the route
 * it just booted from each consuming the full lock wait budget on ONE HTTP
 * request. Other instances do not share this state; after the debounce the
 * next call checks the PostgreSQL journal again. /api/health?retry=1 bypasses
 * the debounce entirely.
 */
let lastStatus: DatabaseState | null = null;
let inFlight: Promise<DatabaseState> | null = null;
let lastFailedAt = 0;
const FAILURE_DEBOUNCE_MS = 1_000;

const initialStatus: DatabaseState = hasDatabase
  ? {
      state: "unavailable",
      detail: "The database has not been initialised yet.",
    }
  : {
      state: "not_configured",
      detail: "DATABASE_URL is not set, so no database is configured.",
    };

/** Outcome of the most recent initialisation attempt (or the initial state). */
export function databaseStatus(): DatabaseState {
  return lastStatus ?? initialStatus;
}

export function isDatabaseReady(): boolean {
  return databaseStatus().state === "ready";
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
    case "DB_MIGRATION_FAILED":
      return "The database migration failed. Please try again after the server-side error is resolved.";
    case "DB_BOOTSTRAP_BUSY":
      return "The database bootstrap cannot acquire its migration lock yet. Please try again shortly.";
    case "55P03":
      return "The database is blocked on a lock from another session. Please try again shortly.";
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
 * Applies pending migrations and verifies the schema is queryable. Ready is
 * memoised locally; an in-flight attempt is shared *only within this process*.
 * A failure is retryable after the short same-request debounce, never sticky.
 */
export function initialiseDatabase(): Promise<DatabaseState> {
  if (lastStatus?.state === "ready") return Promise.resolve(lastStatus);
  if (lastStatus?.state === "not_configured") return Promise.resolve(lastStatus);
  if (inFlight) return inFlight;
  if (lastStatus?.state === "unavailable" && performance.now() - lastFailedAt < FAILURE_DEBOUNCE_MS) {
    return Promise.resolve(lastStatus);
  }
  return startAttempt();
}

/** Forces a fresh attempt — used by `/api/health` when it is asked to re-check. */
export function reinitialiseDatabase(): Promise<DatabaseState> {
  if (inFlight) return inFlight;
  return startAttempt();
}

function startAttempt(): Promise<DatabaseState> {
  inFlight = runInitialisation()
    .then((status) => {
      lastFailedAt = status.state === "unavailable" ? performance.now() : 0;
      return status;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

async function runInitialisation(): Promise<DatabaseState> {
  if (!hasDatabase) {
    lastStatus = {
      state: "not_configured",
      detail:
        "DATABASE_URL is not set. Copy .env.example to .env, point it at a PostgreSQL database, and restart the server.",
    };
    console.warn(`[db] ${lastStatus.detail}`);
    return lastStatus;
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
      lastStatus = {
        state: "unavailable",
        detail: "The database is reachable but contains no tables. Apply the database migrations.",
      };
      console.error(`[db] ${lastStatus.detail}`);
      return lastStatus;
    }
    if (probe.rows?.[0]?.has_users !== true) {
      lastStatus = {
        state: "unavailable",
        detail:
          "The database is reachable but the users table is missing, so the schema is not fully applied.",
      };
      console.error(`[db] ${lastStatus.detail}`);
      return lastStatus;
    }

    lastStatus = { state: "ready", detail: `Connected; ${tables} table(s) present.`, tables };
    return lastStatus;
  } catch (error) {
    lastStatus = { state: "unavailable", detail: describeDatabaseError(error) };
    // Log the real error server-side — the client only ever sees `detail`.
    logDatabaseError("initialisation failed", error);
    return lastStatus;
  }
}
