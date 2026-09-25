/**
 * Cold-start worker for `npm run test:bootstrap` (scripts/bootstrapCheck.ts).
 *
 * Each worker is a separate Node process, so it has a fresh module registry —
 * exactly like a Vercel serverless cold start. The parent spawns several of
 * these against the same isolated PostgreSQL to prove that:
 *
 *   • the committed Drizzle migrations in ./drizzle really create the schema
 *     (including the `users` table the auth routes query);
 *   • concurrent cold starts serialise safely (advisory lock) and both end up
 *     "ready";
 *   • the recorded status can never claim "ready" while the schema is missing.
 *
 * Exit code 0 = the database reached the expected state, 1 = it did not.
 * The expected outcome is passed in EXPECT_READY ("1" or "0"); anything else
 * fails the check, so a half-initialised database can never pass silently.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { databaseStatus, initialiseDatabase } from "@/db/bootstrap";

const expectReady = process.env.EXPECT_READY === "1";
const label = process.env.WORKER_LABEL ?? "worker";

const status = await initialiseDatabase();

if (status.state === "ready" !== expectReady) {
  console.error(
    `[${label}] expected ${expectReady ? "ready" : "not ready"}, got "${status.state}": ${status.detail}`,
  );
  process.exit(1);
}

if (expectReady) {
  // The memoised module state must agree with the returned status — it must
  // not be able to disagree (or stay "ready") after a failed initialisation.
  if (databaseStatus().state !== "ready") {
    console.error(`[${label}] databaseStatus() no longer reports ready after initialisation`);
    process.exit(1);
  }

  // Query the users table exactly like the API routes do — this is the line
  // that returned 42P01 "relation users does not exist" in production when
  // the migrations had never been applied.
  const probe = (await db.execute(
    sql`select count(*)::int as rows from "users"`,
  )) as unknown as { rows?: { rows?: number }[] };
  if (typeof probe.rows?.[0]?.rows !== "number") {
    console.error(`[${label}] could not query the users table`);
    process.exit(1);
  }
  console.log(`[${label}] ready; users table queryable (${probe.rows[0].rows} rows)`);
} else {
  console.log(`[${label}] correctly not ready: ${status.detail}`);
}

process.exit(0);
