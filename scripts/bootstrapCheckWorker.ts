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

  // Optional (RUN_REGISTRATION_PROBE=1): prove that a real registration can
  // proceed after initialisation — insert a user exactly like
  // POST /api/auth/register does, read it back, then clean it up again.
  if (process.env.RUN_REGISTRATION_PROBE === "1") {
    const email = `bootstrap-probe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@gmail.com`;
    const inserted = (await db.execute(
      sql`insert into "users" ("email", "password_hash", "full_name")
          values (${email}, 'probe-hash', 'Bootstrap Probe')
          returning "id"`,
    )) as unknown as { rows?: { id?: number }[] };
    if (typeof inserted.rows?.[0]?.id !== "number") {
      console.error(`[${label}] registration probe: could not insert a user`);
      process.exit(1);
    }
    const found = (await db.execute(
      sql`select count(*)::int as n from "users" where "email" = ${email}`,
    )) as unknown as { rows?: { n?: number }[] };
    const cleaned = (await db.execute(
      sql`delete from "users" where "email" = ${email}`,
    )) as unknown as { rows?: unknown[] };
    if (found.rows?.[0]?.n !== 1 || !Array.isArray(cleaned.rows)) {
      console.error(`[${label}] registration probe: read-back or cleanup failed`);
      process.exit(1);
    }
    console.log(`[${label}] registration probe: user inserted, read back and cleaned up`);
  }
} else {
  console.log(`[${label}] correctly not ready: ${status.detail}`);
}

process.exit(0);
