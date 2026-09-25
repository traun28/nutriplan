/**
 * Independent cold-start worker for the isolated PostgreSQL bootstrap check.
 * It can pause AFTER PostgreSQL grants the migration lock, inject a migration
 * failure, or retry in the same process. These hooks exist only in the test
 * worker; the production bootstrap has no test-specific branches.
 */
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import { Client } from "pg";
import { db } from "@/db";
import { databaseStatus, initialiseDatabase } from "@/db/bootstrap";

const expectReady = process.env.EXPECT_READY === "1";
const label = process.env.WORKER_LABEL ?? "worker";
const gateDir = process.env.TEST_GATE_DIR;
const gateRole = process.env.TEST_GATE_ROLE;
let baselineStatements = 0;
let failedOnce = false;

// Instrument just this worker's pg connections to make cross-process races
// deterministic. Pausing AFTER the query returns holds the real PostgreSQL
// transaction lock while the parent starts a separate Vercel-like instance.
const prototype = Client.prototype as unknown as {
  query: (this: Client, query: string | { text?: string }, ...args: unknown[]) => Promise<{
    rows?: { acquired?: boolean }[];
  }>;
};
const query = prototype.query;
prototype.query = async function (this: Client, statement, ...args) {
  const text = typeof statement === "string" ? statement : statement.text ?? "";
  if (text.includes("-- Baseline schema for NutriPlan.")) {
    baselineStatements++;
    if (process.env.TEST_FAIL_MIGRATION === "1" ||
        (process.env.TEST_FAIL_MIGRATION_ONCE === "1" && !failedOnce)) {
      failedOnce = true;
      const error = new Error("Injected failure in the first migration statement") as Error & { code: string };
      error.code = "TEST_MIGRATION_FAILURE";
      throw error;
    }
  }

  const result = await query.call(this, statement, ...args);
  if (gateDir && text.includes("pg_try_advisory_xact_lock")) {
    if (gateRole === "holder" && result.rows?.[0]?.acquired === true) {
      await writeFile(path.join(gateDir, "holder-acquired"), "");
      const until = Date.now() + 30_000;
      while (!existsSync(path.join(gateDir, "release-holder"))) {
        if (Date.now() >= until) throw new Error("Test holder gate timed out");
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    if (gateRole === "waiter" && result.rows?.[0]?.acquired === false) {
      await writeFile(path.join(gateDir, "waiter-contended"), "");
    }
  }
  return result;
};

if (process.env.TEST_RETRY_AFTER_FAILURE === "1" || process.env.TEST_RETRY_AFTER_BUSY === "1") {
  const first = await initialiseDatabase();
  const expected = process.env.TEST_RETRY_AFTER_BUSY === "1"
    ? "cannot acquire its migration lock"
    : "database migration failed";
  if (first.state !== "unavailable" || !first.detail.toLowerCase().includes(expected)) {
    console.error(`[${label}] expected the first attempt to fail with ${expected}, got ${first.detail}`);
    process.exit(1);
  }
  // Instrumentation and the first route can run back-to-back on ONE HTTP
  // request. It must not spend two full lock wait budgets before responding.
  const immediate = await initialiseDatabase();
  if (immediate !== first) {
    console.error(`[${label}] repeated the failed attempt immediately within one request`);
    process.exit(1);
  }
  console.log(`[${label}] first attempt unavailable (${first.detail}); immediate duplicate was bounded`);
  if (process.env.TEST_RETRY_AFTER_FAILURE === "1") {
    const journal = (await db.execute(
      sql`select to_regclass('drizzle.__drizzle_migrations') as journal`,
    )) as unknown as { rows?: { journal?: string | null }[] };
    if (journal.rows?.[0]?.journal != null) {
      console.error(`[${label}] failed migration left a visible completion journal`);
      process.exit(1);
    }
    console.log(`[${label}] failed migration rolled back its journal`);
  }
  await new Promise((resolve) => setTimeout(resolve, 1_100));
  console.log(`[${label}] retrying in the SAME process`);
}

let status: Awaited<ReturnType<typeof initialiseDatabase>>;
if (process.env.TEST_SAME_PROCESS_CONCURRENCY === "1") {
  const calls = Array.from({ length: 6 }, () => initialiseDatabase());
  if (!calls.every((call) => call === calls[0])) {
    console.error(`[${label}] concurrent same-process calls did not share the in-flight promise`);
    process.exit(1);
  }
  [status] = await Promise.all(calls);
} else {
  status = await initialiseDatabase();
}

if ((status.state === "ready") !== expectReady) {
  console.error(
    `[${label}] expected ${expectReady ? "ready" : "not ready"}, got "${status.state}": ${status.detail}`,
  );
  process.exit(1);
}

if (expectReady) {
  if (databaseStatus().state !== "ready") {
    console.error(`[${label}] databaseStatus() no longer reports ready after initialisation`);
    process.exit(1);
  }

  // Query the users table exactly like the API routes do. The old production
  // bootstrap reported 42P01 here when the migrations had not been applied.
  const probe = (await db.execute(
    sql`select count(*)::int as rows from "users"`,
  )) as unknown as { rows?: { rows?: number }[] };
  if (typeof probe.rows?.[0]?.rows !== "number") {
    console.error(`[${label}] could not query the users table`);
    process.exit(1);
  }
  if (process.env.TEST_EXPECT_NO_MIGRATION_SQL === "1" && baselineStatements !== 0) {
    console.error(`[${label}] re-ran ${baselineStatements} baseline migration statements despite Drizzle journal`);
    process.exit(1);
  }
  console.log(`[${label}] ready; users table queryable (${probe.rows[0].rows} rows); baseline SQL: ${baselineStatements}`);

  // Optional: a real registration-shaped insert/read-back/delete after the
  // migrations commit, on the normal application query pool.
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
