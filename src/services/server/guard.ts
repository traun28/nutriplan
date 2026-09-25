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

/**
 * Like `readJson`, but tells "no body was sent" apart from "the body was sent
 * and is not valid JSON".
 *
 * `readJson` returns null for both, so a malformed request would be silently
 * treated as an empty one and answered with a *business* error (or, worse,
 * accepted). Routes whose fields are all optional use this instead, so a
 * broken body is rejected as a client error while a body-less request still
 * works.
 */
export async function readOptionalJson<T>(
  request: Request,
): Promise<{ ok: true; value: T | null } | { ok: false }> {
  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false };
  }
  if (text.trim() === "") return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(text) as T };
  } catch {
    return { ok: false };
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
