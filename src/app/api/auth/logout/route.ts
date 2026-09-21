/**
 * POST /api/auth/logout — invalidate the session and clear the cookie.
 */
import { cookies } from "next/headers";
import {
  clearSessionCookie,
  destroySession,
  SESSION_COOKIE,
} from "@/services/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const store = await cookies();
    await destroySession(store.get(SESSION_COOKIE)?.value);
  } catch {
    // fall through to clearing the cookie regardless
  }
  const response = Response.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
