/**
 * GET /api/health — an honest database diagnostic.
 *
 * The previous version only ran `select 1`, so it reported "connected" for a
 * database that had no tables at all — exactly the situation that makes every
 * data page return 503. This version reports configuration, reachability and
 * schema state separately, so the real cause is visible in one request.
 */
import { db, hasDatabase } from "@/db";
import { databaseStatus, describeDatabaseError, initialiseDatabase, reinitialiseDatabase } from "@/db/bootstrap";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // `?retry=1` retries a failed boot; a ready boot is already cached.
  const retry = new URL(request.url).searchParams.get("retry") === "1";

  if (!hasDatabase) {
    const status = retry ? await reinitialiseDatabase() : await initialiseDatabase();
    return Response.json(
      {
        ok: false,
        configured: false,
        database: "not configured",
        schema: "unknown",
        detail: status.detail,
        mode: process.env.NODE_ENV === "production" ? "production" : "development",
      },
      // Still 200: "the server is up, the database is not configured" is a
      // valid, reportable state — and 503 here would hide which of the two
      // failed. `ok:false` carries the truth.
    );
  }

  const status = retry ? await reinitialiseDatabase() : await initialiseDatabase();

  if (status.state !== "ready") {
    return Response.json(
      {
        ok: false,
        configured: true,
        database: "unavailable",
        schema: "unverified",
        detail: status.detail,
      },
      { status: 503 },
    );
  }

  // Schema is present; confirm a real table is queryable, not just catalogued.
  try {
    await db.execute(sql`select 1 from "users" limit 1`);
  } catch (error) {
    const detail = describeDatabaseError(error);
    console.error("[health] schema probe failed:", detail);
    return Response.json(
      {
        ok: false,
        configured: true,
        database: "unavailable",
        schema: "unverified",
        detail,
      },
      { status: 503 },
    );
  }

  return Response.json({
    ok: true,
    configured: true,
    database: "connected",
    schema: "ready",
    tables: status.state === "ready" ? status.tables : undefined,
    detail: databaseStatus().detail,
  });
}
