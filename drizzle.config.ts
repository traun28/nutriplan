import "dotenv/config";
import { defineConfig } from "drizzle-kit";

/**
 * Same local development database the app defaults to (src/db/index.ts):
 * the embedded PostgreSQL started by `npm run db:local`. Falls back to it
 * only outside production, so `npm run db:push` works without a `.env` in
 * local development while production still requires an explicit DATABASE_URL.
 */
const LOCAL_DEV_DATABASE_URL =
  "postgresql://nutriplan:nutriplan@127.0.0.1:5432/nutriplan";

const databaseUrl =
  process.env.DATABASE_URL ||
  (process.env.NODE_ENV !== "production" ? LOCAL_DEV_DATABASE_URL : undefined);

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run Drizzle commands");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: {
    url: databaseUrl,
  },
});
