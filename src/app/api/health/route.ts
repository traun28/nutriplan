import { db, hasDatabase } from "@/db";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health — accurate server-side diagnosis of the database
 * connection. Never fakes a healthy state: if the configured database
 * cannot run a query, the response says so and carries a short reason.
 */
export async function GET() {
  if (!hasDatabase) {
    return Response.json({
      ok: false,
      database: "not configured",
      mode: process.env.NODE_ENV === "production" ? "production" : "development",
      error: "DATABASE_URL is not set and no local database is configured.",
    });
  }
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, database: "connected" });
  } catch (error) {
    // Report the underlying driver/OS reason (not the query wrapper).
    let reason = "The database did not respond.";
    let current: unknown = error;
    for (let depth = 0; current && depth < 5; depth += 1) {
      if (current instanceof Error && current.message) reason = current.message;
      current =
        typeof current === "object" && current !== null && "cause" in current
          ? (current as { cause: unknown }).cause
          : null;
    }
    return Response.json(
      {
        ok: false,
        database: "unavailable",
        // Short, safe reason (driver message only — never a stack trace).
        error: reason.slice(0, 200),
      },
      { status: 503 },
    );
  }
}
