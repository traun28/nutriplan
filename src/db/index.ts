import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * Local development database — the exact cluster `npm run db:local` boots
 * (embedded PostgreSQL, see start-pg.mjs). Used only when DATABASE_URL is
 * unset outside production, so `npm run db:local && npm run dev` works with
 * zero configuration and every query still hits a real PostgreSQL.
 */
const LOCAL_DEV_DATABASE_URL =
  "postgresql://nutriplan:nutriplan@127.0.0.1:5432/nutriplan";

const isProduction = process.env.NODE_ENV === "production";

const databaseUrl =
  process.env.DATABASE_URL ||
  (!isProduction ? LOCAL_DEV_DATABASE_URL : undefined);

if (!process.env.DATABASE_URL && !isProduction) {
  console.warn(
    "[nutriplan] DATABASE_URL is not set — using the local development database " +
      `(postgresql://nutriplan:nutriplan@127.0.0.1:5432/nutriplan). Run "npm run db:local" to start it, ` +
      "or set DATABASE_URL in .env to use another PostgreSQL.",
  );
}

export const hasDatabase = Boolean(databaseUrl);

/**
 * In production a missing database means accounts and data would silently
 * vanish on every restart, so the auth routes refuse to run instead. In
 * development the local database URL above is always available.
 */
export const databaseRequiredError =
  !hasDatabase && isProduction
    ? "The server is not configured with a database yet. Please try again later."
    : null;

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool(
    databaseUrl
      ? {
          connectionString: databaseUrl,
          // Fail fast with a clear error instead of hanging requests when the
          // database is down; recycle idle clients so a restarted database is
          // picked up automatically.
          max: 10,
          connectionTimeoutMillis: 5_000,
          idleTimeoutMillis: 30_000,
        }
      : {},
  );

// Idle clients can emit errors (e.g. the database restarting underneath the
// pool). An unhandled "error" event would crash the server — log and survive.
pool.on("error", (error) => {
  console.error("[nutriplan] database pool error:", error.message);
});

if (!isProduction) {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
