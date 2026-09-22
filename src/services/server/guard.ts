/**
 * Part 15 — request helpers for API routes.
 *
 * One place that resolves the session from the cookie, so no route handler
 * has to know how authentication is stored. Returns null when unauthorised
 * (never throws), which lets routes answer 401 cleanly. When the database
 * is unreachable, `unauthorized()` probes it and answers an accurate 503
 * instead of pretending the visitor is signed out.
 */
import { sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { getSessionUser, SESSION_COOKIE, type SessionUser } from "@/services/server/auth";

const DB_UNAVAILABLE_MESSAGE =
  "The database is not available right now. Please try again shortly.";

/** Short-lived reachability probe so outage answers stay accurate without
 *  hammering the database on every unauthorised request. */
let reachability: { at: number; ok: boolean } | null = null;
const PROBE_TTL_MS = 3_000;

export async function databaseReachable(): Promise<boolean> {
  if (reachability && Date.now() - reachability.at < PROBE_TTL_MS) {
    return reachability.ok;
  }
  try {
    await db.execute(sql`select 1`);
    reachability = { at: Date.now(), ok: true };
  } catch {
    reachability = { at: Date.now(), ok: false };
  }
  return reachability.ok;
}

export async function currentUser(): Promise<SessionUser | null> {
  try {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    return await getSessionUser(token);
  } catch {
    return null;
  }
}

export async function unauthorized() {
  if (!(await databaseReachable())) {
    return Response.json({ error: DB_UNAVAILABLE_MESSAGE }, { status: 503 });
  }
  return Response.json(
    { error: "You need to sign in to do that." },
    { status: 401 },
  );
}

/** True when the database cannot currently be queried. */
export async function sessionStoreUnavailable(): Promise<boolean> {
  return !(await databaseReachable());
}

export function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

export function notFound(message = "Not found.") {
  return Response.json({ error: message }, { status: 404 });
}

export function serverError(message = "The server could not complete that request.") {
  return Response.json({ error: message }, { status: 500 });
}

/** Reads a JSON body safely; returns null for malformed payloads. */
export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/** Translates a thrown value into a safe JSON error response. */
export function errorResponse(error: unknown, fallback = "The server could not complete that request."): Response {
  const status =
    typeof error === "object" && error !== null && "status" in error && typeof (error as { status: unknown }).status === "number"
      ? (error as { status: number }).status
      : 500;
  const message =
    status < 500 || status === 503
      ? (error instanceof Error && error.message) || fallback
      : fallback;
  return Response.json({ error: message }, { status });
}
