/**
 * Bootstrap/migration/concurrency regression check — npm run test:bootstrap
 *
 * All scenarios use throwaway embedded PostgreSQL databases and independent
 * Node workers (Vercel-like instances), never DATABASE_URL from the shell.
 * Gates in the test worker pause one instance AFTER the real PostgreSQL lock
 * is acquired, making success, failure, crash and frozen-process races real
 * and deterministic. PostgreSQL's Drizzle journal is checked after each race.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
// Run the worker itself as the child process (not the tsx CLI wrapper, which
// spawns a grandchild and cannot be SIGKILLed to test a real instance crash).
const tsxLoader = createRequire(import.meta.url).resolve("tsx");
const HOST = "127.0.0.1";
const USER = "nutriplan";
const PASSWORD = "nutriplan";
const MIGRATED_DB = "nutriplan";
const UNMIGRATED_DB = "nutriplan_unmigrated";
const SUCCESS_DB = "nutriplan_success_race";
const FAILED_DB = "nutriplan_failed_race";
const CRASHED_DB = "nutriplan_crashed_race";
const FROZEN_DB = "nutriplan_frozen_race";
const LOCAL_RETRY_DB = "nutriplan_local_retry";
const LOCAL_CONCURRENT_DB = "nutriplan_local_concurrent";
const MANY_DB = "nutriplan_many_instances";
const DIRECT_DB = "nutriplan_direct_migrations";
const RUNTIME_DB = "nutriplan_runtime_queries";
const databases = [
  MIGRATED_DB, UNMIGRATED_DB, SUCCESS_DB, FAILED_DB, CRASHED_DB,
  FROZEN_DB, LOCAL_RETRY_DB, LOCAL_CONCURRENT_DB, MANY_DB,
  DIRECT_DB, RUNTIME_DB,
];
const oldLock = "SELECT pg_try_advisory_lock(hashtext('nutriplan'), hashtext('drizzle_migrations')) AS acquired";
const oldUnlock = "SELECT pg_advisory_unlock(hashtext('nutriplan'), hashtext('drizzle_migrations')) AS released";

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
      server.close(() => resolve(address.port));
    });
  });
}

function url(database: string, port: number) {
  return `postgresql://${USER}:${PASSWORD}@${HOST}:${port}/${database}`;
}

interface WorkerResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  output: string;
  elapsedMs: number;
}
interface WorkerOptions {
  database: string;
  expectReady: boolean;
  label: string;
  autoMigrate?: boolean;
  port: number;
  cwd?: string;
  env?: Record<string, string>;
}

function startWorker(options: WorkerOptions): { result: Promise<WorkerResult>; kill: () => void } {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("TEST_") || key === "DB_AUTO_MIGRATE" ||
        key === "DB_BOOTSTRAP_LOCK_WAIT_MS" || key === "RUN_REGISTRATION_PROBE") delete env[key];
  }
  env.DATABASE_URL = url(options.database, options.port);
  env.DATABASE_URL_UNPOOLED = url(options.database, options.port);
  env.TSX_TSCONFIG_PATH = tsconfigPath;
  env.EXPECT_READY = options.expectReady ? "1" : "0";
  env.WORKER_LABEL = options.label;
  if (options.autoMigrate === false) env.DB_AUTO_MIGRATE = "false";
  if (options.env) Object.assign(env, options.env);

  const startedAt = Date.now();
  const child = spawn(process.execPath, ["--import", tsxLoader, workerPath], {
    cwd: options.cwd ?? repoRoot, env, stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  child.on("error", (error) => (output += `${error.message}\n`));
  const result = new Promise<WorkerResult>((resolve) => {
    const timer = setTimeout(() => child.kill("SIGKILL"), 120_000);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, output, elapsedMs: Date.now() - startedAt });
    });
  });
  return { result, kill: () => child.kill("SIGKILL") };
}

function runWorker(options: WorkerOptions): Promise<WorkerResult> {
  return startWorker(options).result;
}

function lastLine(result: WorkerResult): string {
  return result.output.trim().split("\n").pop() ?? "";
}

async function waitForMarker(marker: string) {
  const deadline = Date.now() + 10_000;
  while (!existsSync(marker)) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for test worker marker: ${path.basename(marker)}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function countJournal(database: string, port: number): Promise<number> {
  const client = new Client({ connectionString: url(database, port) });
  try {
    await client.connect();
    const result = await client.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM "drizzle"."__drizzle_migrations"',
    );
    return result.rows[0]?.n ?? 0;
  } finally {
    await client.end();
  }
}

/** A waits holding an actual PG transaction lock; B must contend with it. */
async function coordinatedRace(database: string, port: number, outcome: "success" | "failure" | "crash" | "frozen") {
  const gate = await mkdtemp(path.join(os.tmpdir(), `nutriplan-${outcome}-gate-`));
  const holder = startWorker({
    database, port, label: `${outcome} A`, expectReady: outcome === "success",
    env: {
      TEST_GATE_DIR: gate, TEST_GATE_ROLE: "holder",
      ...(outcome === "failure" ? { TEST_FAIL_MIGRATION: "1" } : {}),
    },
  });
  let waiter: ReturnType<typeof startWorker> | undefined;
  try {
    await waitForMarker(path.join(gate, "holder-acquired"));
    waiter = startWorker({
      database, port, label: `${outcome} B`, expectReady: true,
      env: {
        TEST_GATE_DIR: gate, TEST_GATE_ROLE: "waiter",
        ...(outcome === "success" ? { TEST_EXPECT_NO_MIGRATION_SQL: "1" } : {}),
        ...(outcome === "frozen" ? { TEST_RETRY_AFTER_BUSY: "1" } : {}),
      },
    });
    await waitForMarker(path.join(gate, "waiter-contended"));

    // On a crash the OS closes the socket; on a frozen function it does NOT.
    // PostgreSQL's idle_in_transaction_session_timeout must reap that holder
    // without the application running finally or releasing a session lock.
    if (outcome === "crash") holder.kill();
    if (outcome === "success" || outcome === "failure") {
      await writeFile(path.join(gate, "release-holder"), "");
    }

    const b = await waiter.result;
    if (outcome === "frozen") await writeFile(path.join(gate, "release-holder"), "");
    const a = await holder.result;

    check(
      `${outcome}: A ${outcome === "success" ? "commits" : outcome === "crash" ? "is killed" : outcome === "frozen" ? "is reaped by PostgreSQL" : "reports the migration failure"}`,
      outcome === "crash" ? a.signal === "SIGKILL" :
        outcome === "failure" ? a.code === 0 && /TEST_MIGRATION_FAILURE/.test(a.output) && /database migration failed/i.test(a.output) && !/DB_BOOTSTRAP_BUSY/.test(a.output) :
        outcome === "frozen" ? a.code === 0 && /idle-in-transaction timeout/i.test(a.output) : a.code === 0,
      lastLine(a),
    );
    check(
      `${outcome}: B ${outcome === "frozen" ? "retries in the same process and " : ""}observes completion and is ready`,
      b.code === 0 && /ready; users table queryable/.test(b.output) &&
        (outcome !== "frozen" || (/first attempt unavailable/.test(b.output) &&
          /immediate duplicate was bounded/.test(b.output) && /retrying in the SAME process/.test(b.output))) &&
        (outcome !== "success" || /baseline SQL: 0/.test(b.output)),
      lastLine(b),
    );
    check(`${outcome}: Drizzle journal records the migration once`,
      (await countJournal(database, port)) === 1);
  } finally {
    holder.kill();
    waiter?.kill();
    await Promise.all([holder.result, waiter?.result]);
    await rm(gate, { recursive: true, force: true });
  }
}

async function main() {
  const port = await freePort();
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "nutriplan-bootstrap-"));
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir, user: USER, password: PASSWORD, port,
    persistent: true, // removed in finally; never points to Neon or a real DB
  });
  let client: Client | null = null;
  try {
    await pg.initialise();
    await pg.start();
    for (const database of databases) await pg.createDatabase(database);
    console.log(`embedded PostgreSQL ready on ${HOST}:${port} (isolated, temp dir)`);

    const race = await Promise.all(Array.from({ length: 2 }, (_, index) =>
      runWorker({ database: MIGRATED_DB, expectReady: true, label: `cold-start ${index + 1}`, port }),
    ));
    check("Two independent cold starts both end ready",
      race.every((r) => r.code === 0), race.map(lastLine).join(" | "));

    client = new Client({ connectionString: url(MIGRATED_DB, port) });
    await client.connect();
    const users = await client.query<{ has_users: boolean }>(
      "SELECT to_regclass('public.users') IS NOT NULL AS has_users",
    );
    check("Migration created the users table", users.rows[0]?.has_users === true);
    const tables = await client.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'",
    );
    check("Migration created the full schema (>= 20 tables)", (tables.rows[0]?.n ?? 0) >= 20,
      `got ${tables.rows[0]?.n ?? 0}`);
    check("Drizzle journal recorded the baseline exactly once", (await countJournal(MIGRATED_DB, port)) === 1);
    await client.end();
    client = null;

    // These URLs intentionally point to DIFFERENT isolated test databases.
    // Migrations must use UNPOOLED, while the readiness probe and normal
    // queries must use DATABASE_URL. Neither value is touched in production.
    const split = await runWorker({ database: RUNTIME_DB, expectReady: false,
      label: "separate URL boot", port,
      env: { DATABASE_URL_UNPOOLED: url(DIRECT_DB, port) } });
    check("Migrations use DATABASE_URL_UNPOOLED, not the runtime query URL",
      split.code === 0 && /no tables/i.test(split.output) &&
      (await countJournal(DIRECT_DB, port)) === 1, lastLine(split));
    const runtimeProbe = new Client({ connectionString: url(RUNTIME_DB, port) });
    try {
      await runtimeProbe.connect();
      const missingUsers = await runtimeProbe.query<{ present: boolean }>(
        "SELECT to_regclass('public.users') IS NOT NULL AS present",
      );
      check("Normal queries use DATABASE_URL (no migrated tables on that URL yet)",
        missingUsers.rows[0]?.present === false);
    } finally {
      await runtimeProbe.end();
    }
    const fallback = await runWorker({ database: RUNTIME_DB, expectReady: true,
      label: "fallback URL boot", port, env: { DATABASE_URL_UNPOOLED: "" } });
    check("Without UNPOOLED, migrations fall back to DATABASE_URL",
      fallback.code === 0 && (await countJournal(RUNTIME_DB, port)) === 1, lastLine(fallback));

    const recognise = await runWorker({ database: MIGRATED_DB, expectReady: true,
      label: "no-migrate boot", autoMigrate: false, port });
    check("DB_AUTO_MIGRATE=false recognises an existing schema", recognise.code === 0, lastLine(recognise));
    const honest = await runWorker({ database: UNMIGRATED_DB, expectReady: false,
      label: "unmigrated boot", autoMigrate: false, port });
    check("An unmigrated database never reports ready", honest.code === 0 && /no tables/i.test(honest.output), lastLine(honest));

    const noDrizzleDir = await mkdtemp(path.join(os.tmpdir(), "nutriplan-no-drizzle-"));
    try {
      const missing = await runWorker({ database: MIGRATED_DB, expectReady: false,
        label: "missing-drizzle boot", port, cwd: noDrizzleDir });
      check("Bundle without ./drizzle reports the missing migrations", missing.code === 0 &&
        /missing the database migrations/i.test(missing.output), lastLine(missing));
    } finally {
      await rm(noDrizzleDir, { recursive: true, force: true });
    }

    // Old deployments use a SESSION lock on the same key. It must still block
    // unsafe concurrent migration. A legacy orphan cannot be stolen safely;
    // once its connection is closed, this version's retry completes. Neither
    // this version nor its tests leave a legacy session lock behind.
    const peer = new Client({ connectionString: url(UNMIGRATED_DB, port) });
    try {
      await peer.connect();
      const held = await peer.query<{ acquired: boolean }>(oldLock);
      if (held.rows[0]?.acquired !== true) throw new Error("Test setup: legacy peer failed to acquire lock");
      const busy = await runWorker({ database: UNMIGRATED_DB, expectReady: false,
        label: "legacy stale-peer boot", port, env: { DB_BOOTSTRAP_LOCK_WAIT_MS: "1200" } });
      check("Legacy session lock: bounded busy, not a 30s/55P03 hang", busy.code === 0 &&
        /cannot acquire its migration lock/i.test(busy.output) &&
        !/55P03|lock timeout/i.test(busy.output) && busy.elapsedMs < 10_000,
      `${busy.elapsedMs}ms — ${lastLine(busy)}`);
    } finally {
      await peer.query(oldUnlock).catch(() => undefined);
      await peer.end();
    }
    const recovered = await runWorker({ database: UNMIGRATED_DB, expectReady: true,
      label: "post-legacy-peer boot", port, env: { RUN_REGISTRATION_PROBE: "1" } });
    check("Legacy peer released: bootstrap self-heals and registration succeeds", recovered.code === 0 &&
      /registration probe: user inserted, read back and cleaned up/i.test(recovered.output), lastLine(recovered));
    const legacyOnMigrated = new Client({ connectionString: url(MIGRATED_DB, port) });
    try {
      await legacyOnMigrated.connect();
      const held = await legacyOnMigrated.query<{ acquired: boolean }>(oldLock);
      if (held.rows[0]?.acquired !== true) throw new Error("Test setup: legacy migrated peer failed to acquire lock");
      const reuse = await runWorker({ database: MIGRATED_DB, expectReady: true,
        label: "reuse-migrated boot", port, env: { TEST_EXPECT_NO_MIGRATION_SQL: "1" } });
      check("Journal already complete: proceed even if a legacy session lock is held",
        reuse.code === 0 && /baseline SQL: 0/.test(reuse.output), lastLine(reuse));
    } finally {
      await legacyOnMigrated.query(oldUnlock).catch(() => undefined);
      await legacyOnMigrated.end();
    }

    // A/B races on a FRESH database, not two workers that happen to finish
    // before they overlap. B definitely observes the held lock in each case.
    await coordinatedRace(SUCCESS_DB, port, "success");
    await coordinatedRace(FAILED_DB, port, "failure");
    await coordinatedRace(CRASHED_DB, port, "crash");
    await coordinatedRace(FROZEN_DB, port, "frozen");

    const retry = await runWorker({ database: LOCAL_RETRY_DB, expectReady: true,
      label: "local retry", port,
      env: { TEST_FAIL_MIGRATION_ONCE: "1", TEST_RETRY_AFTER_FAILURE: "1" } });
    check("One process retries after its own migration failure (no cached failed promise)",
      retry.code === 0 && /TEST_MIGRATION_FAILURE/.test(retry.output) &&
      /failed migration rolled back its journal/.test(retry.output) &&
      /retrying in the SAME process/.test(retry.output) && /ready; users table queryable/.test(retry.output),
      lastLine(retry));
    check("Local retry records the Drizzle migration once", (await countJournal(LOCAL_RETRY_DB, port)) === 1);

    const localCalls = await runWorker({ database: LOCAL_CONCURRENT_DB, expectReady: true,
      label: "local concurrency", port, env: { TEST_SAME_PROCESS_CONCURRENCY: "1" } });
    check("Simultaneous calls in one process share only that process's in-flight promise",
      localCalls.code === 0, lastLine(localCalls));
    check("Same-process concurrency records the Drizzle migration once", (await countJournal(LOCAL_CONCURRENT_DB, port)) === 1);

    const many = await Promise.all(Array.from({ length: 8 }, (_, index) =>
      runWorker({ database: MANY_DB, expectReady: true, label: `instance ${index + 1}`, port }),
    ));
    check("Eight independent production-like cold starts all end ready",
      many.every((r) => r.code === 0), many.map(lastLine).join(" | "));
    check("Eight independent starts record the Drizzle migration only once", (await countJournal(MANY_DB, port)) === 1);
    const repeat = await runWorker({ database: MANY_DB, expectReady: true,
      label: "already-migrated repeat", port, env: { TEST_EXPECT_NO_MIGRATION_SQL: "1" } });
    check("A later independent instance skips all migration SQL", repeat.code === 0 &&
      /baseline SQL: 0/.test(repeat.output), lastLine(repeat));

    // A fresh connection attempts the SAME key as old and new versions;
    // transaction- and session-level holders both conflict with this probe.
    for (const database of databases) {
      const lockProbe = new Client({ connectionString: url(database, port) });
      try {
        await lockProbe.connect();
        const free = await lockProbe.query<{ acquired: boolean }>(oldLock);
        check(`No advisory/session lock remains in ${database}`, free.rows[0]?.acquired === true);
        if (free.rows[0]?.acquired === true) await lockProbe.query(oldUnlock);
      } finally {
        await lockProbe.end();
      }
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
