/**
 * POST /api/auth/login — verify credentials and start a session.
 *
 * The same generic message is returned for an unknown email and for a wrong
 * password, so the endpoint cannot be used to discover which emails exist.
 */
import { eq } from "drizzle-orm";
import { db, hasDatabase } from "@/db";
import { users } from "@/db/schema";
import {
  createSession,
  setSessionCookie,
  verifyPassword,
} from "@/services/server/auth";
import { badRequest, readJson, serverError } from "@/services/server/guard";
import { findDevUser } from "@/services/server/devStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  email?: string;
  password?: string;
}

export async function POST(request: Request) {
  const body = await readJson<Body>(request);
  if (!body) return badRequest("Invalid request.");

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  if (!email || !password) return badRequest("Enter your email and password.");

  try {
    if (!hasDatabase) {
      const user = findDevUser(email);
      const valid = user ? await verifyPassword(password, user.passwordHash) : false;
      if (!user || !valid) {
        return Response.json({ error: "Incorrect email or password." }, { status: 401 });
      }
      const { token, expiresAt } = await createSession(user.id);
      const response = Response.json({
        user: { id: user.id, email: user.email, fullName: user.fullName },
      });
      setSessionCookie(response, token, expiresAt);
      return response;
    }

    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    const user = rows[0];
    const valid = user ? await verifyPassword(password, user.passwordHash) : false;

    if (!user || !valid) {
      return Response.json({ error: "Incorrect email or password." }, { status: 401 });
    }

    const { token, expiresAt } = await createSession(user.id);
    const response = Response.json({
      user: { id: user.id, email: user.email, fullName: user.fullName },
    });
    setSessionCookie(response, token, expiresAt);
    return response;
  } catch {
    return serverError("Could not sign you in.");
  }
}
