import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
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

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool(databaseUrl ? { connectionString: databaseUrl } : {});

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
