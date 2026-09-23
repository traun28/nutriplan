/**
 * One source of truth for "the database could not serve this request".
 *
 * Previously every repository swallowed the driver error and returned the same
 * generic sentence, so a missing `DATABASE_URL`, an unreachable server and a
 * missing table were all indistinguishable — and undiagnosable. These helpers
 * keep the user-facing message friendly while making it *accurate*, and log the
 * real driver error server-side where it belongs.
 */
import { hasDatabase } from "@/db";
import { databaseStatus, describeDatabaseError } from "@/db/bootstrap";

/**
 * Explains why the database cannot serve a request right now.
 *
 * @param fallback shown when the cause is already known to the caller
 *                 (e.g. a unique-constraint conflict handled separately).
 */
export function databaseFailureMessage(fallback: string): string {
  if (!hasDatabase) {
    return "NutriPlan has no database configured on this server, so your saved data cannot be loaded. Set DATABASE_URL and restart the server.";
  }

  const status = databaseStatus();
  if (status.state === "unavailable") {
    return `${status.detail} Your saved data is unaffected — try again in a moment.`;
  }

  return fallback;
}

/**
 * Converts a thrown driver error into an accurate message and records the
 * original error in the server log (never sent to the browser).
 */
export function reportDatabaseError(context: string, error: unknown): string {
  console.error(`[db] ${context} failed:`, error);
  return databaseFailureMessage(describeDatabaseError(error));
}

/**
 * Several profile/dataset reads intentionally degrade to `null`/`[]` so one
 * broken query cannot take a whole page down. That is only acceptable if the
 * failure is still recorded — otherwise an outage looks like "no data yet".
 */
export function logDatabaseFailure(context: string, error: unknown): void {
  console.error(`[db] ${context} failed:`, error instanceof Error ? error.message : error);
}
