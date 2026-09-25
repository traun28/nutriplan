/**
 * Bootstrap/migration system check — run with: npm run test:bootstrap
 *
 * Verifies, against a throwaway embedded PostgreSQL (temp data directory,
 * random port — never a real or production database), that the boot-time
 * initialisation in src/db/bootstrap.ts really applies the committed Drizzle
 * migrations in ./drizzle and that the `users` table (the one whose absence
 * produced 42P01 "relation users does not exist" in production) exists and is
 * queryable afterwards.
 *
 * Scenarios, each in a fresh child process (= a fresh cold start):
 *   A. two concurrent cold starts against an empty database — the advisory
 *      lock must serialise them and both must end "ready";
 *   B. the parent then verifies the schema was created by the migration
 *      system (users table present, Drizzle journal recorded it exactly once);
 *   C. a cold start with DB_AUTO_MIGRATE=false against the migrated database
 *      — it must recognise the existing schema without re-running migrations;
 *   D. a cold start with DB_AUTO_MIGRATE=false against an empty database
 *      — it must honestly report "not ready", never a false success;
 *   E. a cold start whose working directory has no ./drizzle folder (what a
 *      serverless bundle looked like before `outputFileTracingIncludes`) —
 *      it must fail with the real cause instead of a generic error.
 *
 * Exits non-zero on any failure.
 */
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import EmbeddedPostgres from "embedded-postgres";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tsconfigPath = path.join(repoRoot, "tsconfig.json");
const workerPath = path.join(repoRoot, "scripts", "bootstrapCheckWorker.ts");
/** The locally installed tsx CLI (a transitive dependency of drizzle-kit). */
const tsxCli = createRequire(import.meta.url).resolve("tsx/cli");
const HOST = "127.0.0.1";
const USER = "nutriplan";
const PASSWORD = "nutriplan";
const MIGRATED_DB = "nutriplan";
const UNMIGRATED_DB = "nutriplan_unmigrated";

let failures = 0;
let passes = 0;
function check(name: string, ok: boolean, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  — ${extra}` : ""}`);
  if (ok) passes++;
  else failures++;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, HOST, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not find a free port"));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

interface WorkerResult {
  code: number | null;
  output: string;
}

/** Runs one cold-start worker (fresh process ⇒ fresh module state). */
function runWorker(options: {
  database: string;
  expectReady: boolean;
  label: string;
  autoMigrate: boolean;
  port: number;
  /** Working directory of the worker — a directory without ./drizzle simulates
   *  a serverless bundle that was not shipped the migration folder. */
  cwd?: string;
}): Promise<WorkerResult> {
  const url = `postgresql://${USER}:${PASSWORD}@${HOST}:${options.port}/${options.database}`;
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.DB_AUTO_MIGRATE;
  env.DATABASE_URL = url;
  env.DATABASE_URL_UNPOOLED = url; // migrations prefer the direct connection
  env.EXPECT_READY = options.expectReady ? "1" : "0";
  env.WORKER_LABEL = options.label;
  if (!options.autoMigrate) env.DB_AUTO_MIGRATE = "false";

  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [tsxCli, "--tsconfig", tsconfigPath, workerPath],
      { cwd: options.cwd ?? repoRoot, env, stdio: ["ignore", "pipe", "pipe"] },
    );
    let output = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 120_000);
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}

async function main() {
  const port = await freePort();
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "nutriplan-bootstrap-"));
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: USER,
    password: PASSWORD,
    port,
    persistent: true, // the temp directory is removed explicitly at the end
  });

  let client: Client | null = null;
  try {
    await pg.initialise(); // fresh temp directory ⇒ fresh cluster
    await pg.start();
    await pg.createDatabase(MIGRATED_DB);
    await pg.createDatabase(UNMIGRATED_DB);
    console.log(`embedded PostgreSQL ready on ${HOST}:${port} (isolated, temp dir)`);

    /* ---------------------------------------------------------------- */
    /* A. Two concurrent cold starts against the empty database.        */
    /* ---------------------------------------------------------------- */
    const race = await Promise.all([
      runWorker({ database: MIGRATED_DB, expectReady: true, label: "cold-start 1", autoMigrate: true, port }),
      runWorker({ database: MIGRATED_DB, expectReady: true, label: "cold-start 2", autoMigrate: true, port }),
    ]);
    check(
      "Cold-start race: both concurrent initialisations succeeded",
      race.every((r) => r.code === 0),
      race.map((r) => r.output.trim().split("\n").pop() ?? "").join(" | "),
    );

    /* ---------------------------------------------------------------- */
    /* B. The migration system (not db:push) created the schema.        */
    /* ---------------------------------------------------------------- */
    client = new Client({ connectionString: `postgresql://${USER}:${PASSWORD}@${HOST}:${port}/${MIGRATED_DB}` });
    await client.connect();

    const users = await client.query<{ has_users: boolean }>(
      "select to_regclass('public.users') is not null as has_users",
    );
    check(
      "Migration created the users table",
      users.rows[0]?.has_users === true,
    );

    const tables = await client.query<{ n: number }>(
      "select count(*)::int as n from information_schema.tables where table_schema = 'public'",
    );
    check(
      "Migration created the full schema (>= 20 tables)",
      (tables.rows[0]?.n ?? 0) >= 20,
      `got ${tables.rows[0]?.n ?? 0}`,
    );

    const journal = await client.query<{ n: number }>(
      'select count(*)::int as n from "drizzle"."__drizzle_migrations"',
    );
    check(
      "Drizzle journal recorded the baseline migration exactly once",
      journal.rows[0]?.n === 1,
      `got ${journal.rows[0]?.n ?? 0}`,
    );
    await client.end();
    client = null;

    /* ---------------------------------------------------------------- */
    /* C. Recognise an already-migrated database without migrating.     */
    /* ---------------------------------------------------------------- */
    const recognise = await runWorker({
      database: MIGRATED_DB, expectReady: true, label: "no-migrate boot", autoMigrate: false, port,
    });
    check(
      "DB_AUTO_MIGRATE=false recognises the migrated schema as ready",
      recognise.code === 0,
      recognise.output.trim().split("\n").pop() ?? "",
    );

    /* ---------------------------------------------------------------- */
    /* D. An unmigrated database must never be reported ready.          */
    /* ---------------------------------------------------------------- */
    const honest = await runWorker({
      database: UNMIGRATED_DB, expectReady: false, label: "unmigrated boot", autoMigrate: false, port,
    });
    check(
      "Unmigrated database is honestly reported as not ready",
      honest.code === 0 && /no tables/i.test(honest.output),
      honest.output.trim().split("\n").pop() ?? "",
    );

    /* ---------------------------------------------------------------- */
    /* E. A bundle without ./drizzle must fail loudly, not report       */
    /*    ready — this is the original production failure mode.         */
    /* ---------------------------------------------------------------- */
    const noDrizzleDir = await mkdtemp(path.join(os.tmpdir(), "nutriplan-no-drizzle-"));
    try {
      const folderMissing = await runWorker({
        database: MIGRATED_DB, expectReady: false, label: "missing-drizzle boot",
        autoMigrate: true, port, cwd: noDrizzleDir,
      });
      check(
        "Bundle without ./drizzle reports the real cause, never ready",
        folderMissing.code === 0 && /missing the database migrations/i.test(folderMissing.output),
        folderMissing.output.trim().split("\n").filter((line) => line.startsWith("[")).pop() ?? "",
      );
    } finally {
      await rm(noDrizzleDir, { recursive: true, force: true });
    }
  } finally {
    try {
      if (client) await client.end().catch(() => undefined);
    } finally {
      await pg.stop().catch(() => undefined);
      await rm(dataDir, { recursive: true, force: true });
    }
  }

  console.log("");
  if (failures > 0) {
    console.log(`BOOTSTRAP CHECK: ${failures} FAILED, ${passes} passed`);
    process.exit(1);
  }
  console.log(`BOOTSTRAP CHECK: ALL ${passes} PASS`);
}

main().catch((error) => {
  console.error("BOOTSTRAP CHECK: crashed —", error instanceof Error ? error.message : error);
  process.exit(1);
});
