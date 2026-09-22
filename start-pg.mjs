/**
 * Local development database — zero external setup.
 *
 * Boots an embedded PostgreSQL 18 instance (binaries come from the
 * `embedded-postgres` dev dependency, no system install needed) and stores
 * its data in `.pgdata/` inside this project (gitignored). On first run it
 * also creates the `nutriplan` database.
 *
 * Usage:
 *   npm run db:local        # starts PostgreSQL on 127.0.0.1:5432
 *
 * Then make sure `.env` contains:
 *   DATABASE_URL=postgresql://nutriplan:nutriplan@127.0.0.1:5432/nutriplan
 *
 * and create the tables:
 *   npm run db:push
 *
 * Stop it by killing the process (or the terminal running it). The data
 * stays in `.pgdata/` and is reused on the next start; delete the folder to
 * reset.
 */
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { existsSync } from "node:fs";

const require = createRequire(import.meta.url);
const EmbeddedPostgres = require("embedded-postgres").default;

const HOST = "127.0.0.1";
const PORT = Number(process.env.PG_PORT ?? 5432);
const USER = "nutriplan";
const PASSWORD = "nutriplan";
const DB_NAME = "nutriplan";
const DATA_DIR = path.join(process.cwd(), ".pgdata");

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: USER,
  password: PASSWORD,
  port: PORT,
  host: HOST,
  persistent: true,
});

// initialise() unconditionally runs initdb — only do it for a fresh
// data directory (PG_VERSION marks a successfully initialised cluster).
const alreadyInitialised = existsSync(path.join(DATA_DIR, "PG_VERSION"));
if (!alreadyInitialised) {
  await pg.initialise();
}
await pg.start();

// initdb creates `postgres`, `template0`, `template1` — but not our app DB.
// (getPgClient() returns an unconnected client — connect explicitly.)
const client = await pg.getPgClient();
await client.connect();
const existing = await client.query(
  "SELECT 1 FROM pg_database WHERE datname = $1",
  [DB_NAME],
);
if (existing.rowCount === 0) {
  await pg.createDatabase(DB_NAME);
  console.log(`created database "${DB_NAME}"`);
}
await client.end();

console.log("");
console.log(`PostgreSQL ready on ${HOST}:${PORT}`);
console.log(`  DATABASE_URL=postgresql://${USER}:${PASSWORD}@${HOST}:${PORT}/${DB_NAME}`);
console.log("Now run:  npm run db:push");

// Keep the process alive so the database stays up.
process.on("SIGINT", async () => {
  await pg.stop();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await pg.stop();
  process.exit(0);
});
