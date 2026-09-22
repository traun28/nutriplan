/**
 * Part 15 — request helpers for API routes.
 *
 * One place that resolves the session from the cookie, so no route handler
 * has to know how authentication is stored. Returns null when unauthorised
 * (never throws), which lets routes answer 401 cleanly.
 */
import { cookies } from "next/headers";
import { getSessionUser, SESSION_COOKIE, type SessionUser } from "@/services/server/auth";

export async function currentUser(): Promise<SessionUser | null> {
  try {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    return await getSessionUser(token);
  } catch {
    return null;
  }
}

export function unauthorized() {
  return Response.json(
    { error: "You need to sign in to do that." },
    { status: 401 },
  );
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
