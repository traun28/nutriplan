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
 *
 * ── Concurrency: why the advisory lock looks the way it does ─────────────────
 * Several serverless instances cold-start at once (every Vercel function runs
 * this instrumentation hook), so exactly one of them may run the Drizzle
 * migrator at a time — the migrator itself does **not** serialise (two
 * concurrent `migrate()` calls race on `CREATE SCHEMA` and on the journal
 * insert). The key serialiser is therefore an advisory lock. The production
 * incident of 25 September (55P03 after ~30 s on every cold start) showed what
 * the *previous* shape gets wrong:
 *
 *   SET lock_timeout = '30s';
 *   SELECT pg_advisory_lock(k1, k2);        ← session-level, blocking
 *
 * A session-level lock lives until its backend dies. A serverless function can
 * be suspended or killed without a clean TCP close; until the database's TCP
 * keepalive reaps that backend (minutes to hours), the lock stays held — and
 * every other cold start then blocks on `pg_advisory_lock` for the full
 * `lock_timeout` (30 s) and dies with 55P03 "canceling statement due to lock
 * timeout". This module therefore never *blocks* on the lock:
 *
 *   1. try it non-blockingly (`pg_try_advisory_lock`, same key);
 *   2. while it is busy, check whether the other instance already applied
 *      everything (Drizzle journal covers the local migrations) — if so,
 *      reuse its result instead of waiting at all;
 *   3. otherwise keep trying, non-blockingly, for a short bounded budget;
 *   4. if the budget is exhausted, fail *fast* with a clear retryable state
 *      (never a 30 s hang, never 55P03) — the next attempt recovers, because
 *      a live peer finishes in seconds and a stale one is reaped by the
 *      database itself.
 *
 * The lock remains session-level rather than transaction-scoped on purpose:
 * Drizzle's migrator manages its own `BEGIN`/`COMMIT` internally, so a
 * `pg_advisory_xact_lock` taken beforehand would be released by the migrator's
 * own first commit — mid-work. Instead the lock is held only for as long as
 * the migration runs, on a dedicated (never pooled) connection, and released
 * twice: explicitly in `finally`, and by the guaranteed `client.end()`.
 */
import { existsSync, readFileSync } from "node:fs";
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
 * The serialising key. Two `hashtext`ed constants → the `(integer, integer)`
 * advisory-lock variant. It must stay exactly this value across deploys, so
 * that an instance of the old (blocking) code and one of the new code still
 * recognise each other's lock.
 */
const ADVISORY_LOCK_ACQUIRE =
  "SELECT pg_try_advisory_lock(hashtext('nutriplan'), hashtext('drizzle_migrations')) AS acquired";
const ADVISORY_LOCK_RELEASE =
  "SELECT pg_advisory_unlock(hashtext('nutriplan'), hashtext('drizzle_migrations')) AS released";

/**
 * How long a cold start may wait for a *busy* migration lock before failing
 * fast with a retryable state. A live peer finishes its baseline migration in
 * well under a second on a warm database; the budget mostly exists for the
 * stale-holder case, where the honest answer is "someone else is still
 * working — retry in a moment", not a 30 s hang.
 */
const LOCK_WAIT_BUDGET_MS = parseNonNegativeMs(process.env.DB_BOOTSTRAP_LOCK_WAIT_MS, 8_000);
const LOCK_POLL_INTERVAL_MS = 500;

function parseNonNegativeMs(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

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

/** Newest `when` (folderMillis) in the local `drizzle/meta/_journal.json`. */
function newestLocalMigrationMillis(): number {
  const journal = JSON.parse(
    readFileSync(path.join(MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf8"),
  ) as { entries?: { when?: unknown }[] };
  const millis = (journal.entries ?? [])
    .map((entry) => Number(entry.when))
    .filter((value) => Number.isFinite(value));
  return millis.length > 0 ? Math.max(...millis) : 0;
}

/**
 * Has the database already recorded every migration in this bundle?
 *
 * The migrator applies all local migrations newer than the *single newest*
 * journal row, so coverage is simply `max(created_at) >= newest local when`.
 * (A journal that is *newer* than this bundle also counts as covered — there
 * is nothing for this bundle to do.) A missing journal table (42P01) means the
 * other instance has not created it yet — not "applied", never an error.
 */
async function allLocalMigrationsApplied(client: Client): Promise<boolean> {
  const newest = newestLocalMigrationMillis();
  let latest: string | null | undefined;
  try {
    const result = await client.query<{ latest: string | null }>(
      'SELECT max(created_at) AS latest FROM "drizzle"."__drizzle_migrations"',
    );
    latest = result.rows[0]?.latest;
  } catch (error) {
    if (pickCode(error) === "42P01") return false;
    throw error;
  }
  if (latest === null || latest === undefined) return false; // journal absent or empty
  return Number(latest) >= newest;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * The migration lock is busy (another instance holds it). Never block:
 * reuse the other instance's result once its work is committed, otherwise
 * keep trying non-blockingly for a short budget.
 *
 * @returns `applied`  — schema work is done; the caller may skip the migrator
 * @returns `acquired` — the lock is now held by *this* connection
 * @throws               budget exhausted → `DB_BOOTSTRAP_BUSY` (retryable)
 */
async function waitForMigrationSlot(client: Client): Promise<"applied" | "acquired"> {
  const deadline = Date.now() + LOCK_WAIT_BUDGET_MS;
  for (;;) {
    if (await allLocalMigrationsApplied(client)) return "applied";

    const lock = await client.query<{ acquired: boolean }>(ADVISORY_LOCK_ACQUIRE);
    if (lock.rows[0]?.acquired === true) return "acquired";

    if (Date.now() >= deadline) break;
    await sleep(LOCK_POLL_INTERVAL_MS);
  }

  // One last chance: the peer may have committed just as the budget ended.
  if (await allLocalMigrationsApplied(client)) return "applied";

  const error = new Error(
    "Another server instance is still running the database bootstrap and the schema is not applied yet; the retry will finish it.",
  ) as Error & { code?: string };
  error.code = "DB_BOOTSTRAP_BUSY";
  throw error;
}

async function runMigrations(): Promise<void> {
  const directUrl = process.env.DATABASE_URL_UNPOOLED?.trim();
  const migrationUrl = directUrl || process.env.DATABASE_URL?.trim();
  if (!migrationUrl) throw new Error("No database URL is configured for migrations.");

  // Session-level locks cannot work through Neon's transaction pooler (the
  // "session" may be a different backend per statement), so a pooler URL is a
  // configuration error, not a fallback. The direct URL also works locally.
  if (new URL(migrationUrl).hostname.includes("-pooler.")) {
    throw new Error("Bootstrap requires a direct DATABASE_URL_UNPOOLED connection.");
  }

  assertMigrationsFolder();

  // Keep DDL off the pooled runtime client; this dedicated connection is
  // closed again in the `finally` below on every path, success or failure.
  const client = new Client({
    connectionString: migrationUrl,
    connectionTimeoutMillis: 10_000,
    application_name: "nutriplan-migrations",
  });
  client.on("error", (error) => logDatabaseError("migration connection lost", error));

  let connected = false;
  let lockAcquired = false;
  try {
    await client.connect();
    connected = true;

    // Backstop, not the concurrency mechanism: if a *statement* on this
    // connection is ever blocked by an external DDL lock (e.g. somebody runs
    // `drizzle-kit push` by hand at the same moment), fail fast in 10 s
    // instead of hanging the serverless function forever. The peer-to-peer
    // serialisation itself is the non-blocking advisory lock below.
    await client.query("SET lock_timeout = '10s'");

    const firstTry = await client.query<{ acquired: boolean }>(ADVISORY_LOCK_ACQUIRE);
    lockAcquired = firstTry.rows[0]?.acquired === true;

    let skipMigrate = false;
    if (!lockAcquired) {
      // A concurrent (or stale) instance holds the lock. Never wait on it —
      // see the module header for the incident this prevents.
      const slot = await waitForMigrationSlot(client);
      if (slot === "applied") skipMigrate = true;
      else lockAcquired = true;
    }

    if (!skipMigrate) {
      try {
        await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
      } catch (error) {
        // Surface the real migration failure (sanitised) instead of letting
        // the boot continue as if the schema had been applied.
        logDatabaseError("migration failed", error);
        throw error;
      }
    }
  } finally {
    if (connected) {
      if (lockAcquired) {
        // Explicit release on every path — including a failed migration
        // (Drizzle has already rolled back its own transaction by here). The
        // `end()` below is the second, independent guarantee: a closed
        // connection always relinquishes its session locks server-side.
        await client
          .query(ADVISORY_LOCK_RELEASE)
          .catch((error) => logDatabaseError("advisory unlock failed", error));
      }
      // ALWAYS close the dedicated connection — requirement of the incident:
      // no lock may outlive this connection.
      await client.end().catch((error) => logDatabaseError("closing migration connection failed", error));
    }
  }
}

export type DatabaseState =
  | { state: "not_configured"; detail: string }
  | { state: "ready"; detail: string; tables: number }
  | { state: "unavailable"; detail: string };

/**
 * Process-local state machine:
 *
 *   • `not_configured` — no DATABASE_URL (in-memory dev store instead);
 *   • uninitialised    — configured, but no attempt has run yet in this
 *                        process (`databaseStatus()` reports that);
 *   • initialising     — exactly one in-flight attempt, *shared* by every
 *                        concurrent caller in this process (never two at once);
 *   • ready            — schema verified; memoised for the life of the
 *                        process, re-checked on demand via `/api/health?retry=1`;
 *   • failed/retryable — the last attempt failed; it is *not* cached forever —
 *                        a fresh attempt starts after a short cooldown, so a
 *                        stale failure (or a stale lock) can never strand the
 *                        process on a dead promise.
 */
let lastStatus: DatabaseState | null = null;
let inFlight: Promise<DatabaseState> | null = null;
let lastAttemptStartedAt = 0;

/** After a failed attempt, wait this long before the next attempt, so a dead
 *  database is not re-hit on every single request. */
const RETRY_COOLDOWN_MS = 5_000;

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
    case "DB_BOOTSTRAP_BUSY":
      return "Another server is still finishing the database bootstrap — it takes a few seconds. Please try again shortly.";
    case "55P03":
      return "The database is blocked on a long-held lock from another session. The retry continues automatically.";
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
 * Safe to call repeatedly: ready is memoised, concurrent callers share the
 * one in-flight attempt, and a failure is retryable — never sticky.
 */
export function initialiseDatabase(): Promise<DatabaseState> {
  if (lastStatus?.state === "ready") return Promise.resolve(lastStatus);
  if (lastStatus?.state === "not_configured") return Promise.resolve(lastStatus);
  // One in-flight attempt per process; concurrent callers wait on *it*, not on
  // any database lock, and never start a second, racing initialisation.
  if (inFlight) return inFlight;
  // Failed recently? Keep the previous (failed) status for the cooldown window
  // so a dead database is not hammered on every request — then retry.
  if (lastStatus && Date.now() - lastAttemptStartedAt < RETRY_COOLDOWN_MS) {
    return Promise.resolve(lastStatus);
  }
  return startAttempt();
}

/** Forces a fresh attempt — used by `/api/health` when it is asked to re-check. */
export function reinitialiseDatabase(): Promise<DatabaseState> {
  // An attempt already in flight is shared, not duplicated.
  if (inFlight) return inFlight;
  return startAttempt();
}

function startAttempt(): Promise<DatabaseState> {
  lastAttemptStartedAt = Date.now();
  inFlight = runInitialisation().finally(() => {
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
