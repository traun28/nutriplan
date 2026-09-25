/**
 * Server boot hook.
 *
 * `register()` runs once when the Node server starts, before any request is
 * served. That is the correct place to make sure the database schema exists:
 * doing it per request would add latency and race concurrent requests, and
 * doing it only from a CLI step (`npm run db:push`) leaves the app returning
 * 503 on every page if anyone forgets that step.
 *
 * Server-side only — this file never reaches the browser bundle.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { hasDatabase } = await import("@/db");
  if (!hasDatabase) {
    console.warn(
      "[db] DATABASE_URL is not set — persistent storage is disabled. " +
        "Copy .env.example to .env, or run `npm run db:local` for a local PostgreSQL.",
    );
    return;
  }

  const { databaseStatus, initialiseDatabase } = await import("@/db/bootstrap");
  await initialiseDatabase();

  const status = databaseStatus();
  if (status.state === "ready") {
    console.log(`[db] ${status.detail}`);
  } else {
    console.error(`[db] ${status.detail}`);
  }
}
