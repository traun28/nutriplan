/**
 * Database connection — the single place a PostgreSQL pool is created.
 *
 * Two things matter here:
 *
 * 1. The pool is created once per process and cached on `globalThis`, so hot
 *    reloads in development do not leak a new pool (and its sockets) on every
 *    edit. Because the pool is cached, `DATABASE_URL` is read once — changing
 *    it requires a server restart.
 *
 * 2. Every connection attempt is bounded. Without `connectionTimeoutMillis`
 *    the `pg` driver waits forever, which turns one unreachable database into
 *    a queue of hung requests and eventually an exhausted pool. Bounded
 *    timeouts make an outage fail fast and report itself instead.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

/** Trimmed so a blank value or a leftover placeholder never counts as configured. */
const databaseUrl = process.env.DATABASE_URL?.trim() || undefined;

export const hasDatabase = Boolean(databaseUrl);

/**
 * Without DATABASE_URL the app falls back to an in-memory store so it can be
 * explored locally without any setup. That fallback is development-only:
 * in production a missing database means accounts and data would silently
 * vanish on every restart, so the auth routes refuse to run instead.
 */
export const databaseRequiredError =
  !hasDatabase && process.env.NODE_ENV === "production"
    ? "The server is not configured with a database yet. Please try again later."
    : null;

const poolConfig: PoolConfig = databaseUrl
  ? {
      connectionString: databaseUrl,
      // Bound the pool: 10 concurrent connections is plenty for this app and
      // prevents a burst of requests from opening sockets without limit.
      max: 10,
      // Allow Neon to wake up without waiting indefinitely for a connection.
      connectionTimeoutMillis: 30_000,
      // Release sockets that sit idle, so a restarted database is reconnected.
      idleTimeoutMillis: 30_000,
      application_name: "nutriplan",
    }
  : {
      // Deliberately unreachable. If DATABASE_URL is absent we must never fall
      // back to the driver's defaults (local socket, current OS user), which
      // could silently connect to an unrelated PostgreSQL instance. A refused
      // connection on port 1 fails immediately and is reported accurately.
      host: "127.0.0.1",
      port: 1,
      database: "nutriplan_unconfigured",
      user: "nutriplan",
      max: 1,
      connectionTimeoutMillis: 1_000,
    };

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

function createPool(): Pool {
  const created = new Pool(poolConfig);
  // An idle client can be terminated by the server (restart, idle timeout).
  // `pg` emits that on the pool; with no listener it becomes an unhandled
  // 'error' event and takes the whole Node process down.
  created.on("error", (error) => {
    console.error("[db] idle client error:", error.message);
  });
  return created;
}

export const pool = globalForDb.__arenaNextJsPostgresqlPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
