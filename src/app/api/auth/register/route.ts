/**
 * POST /api/auth/register — create an account.
 *
 * Validates input, hashes the password with scrypt, then starts a session.
 * Only @gmail.com addresses are accepted (see `@/lib/email`).
 * Passwords are never returned or logged.
 */
import { eq } from "drizzle-orm";
import { databaseRequiredError, db, hasDatabase } from "@/db";
import { logDatabaseError } from "@/db/errors";
import { users } from "@/db/schema";
import {
  createSession,
  hashPassword,
  setSessionCookie,
} from "@/services/server/auth";
import { badRequest, readJson, serverError } from "@/services/server/guard";
import { createDevUser, findDevUser } from "@/services/server/devStore";
import { validateGmailAddress } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  email?: string;
  password?: string;
  fullName?: string;
}

export async function POST(request: Request) {
  const body = await readJson<Body>(request);
  if (!body) return badRequest("Invalid request.");

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const fullName = (body.fullName ?? "").trim();

  const emailError = validateGmailAddress(email);
  if (emailError) return badRequest(emailError);
  if (password.length < 8)
    return badRequest("Password must be at least 8 characters.");
  if (fullName.length < 2) return badRequest("Please enter your name.");

  if (databaseRequiredError) {
    return Response.json({ error: databaseRequiredError }, { status: 503 });
  }

  try {
    if (!hasDatabase) {
      if (findDevUser(email))
        return Response.json(
          { error: "An account with that email already exists." },
          { status: 409 },
        );
      const user = createDevUser(email, fullName, await hashPassword(password));
      const { token, expiresAt } = await createSession(user.id);
      const response = Response.json({
        user: { id: user.id, email: user.email, fullName: user.fullName },
      });
      setSessionCookie(response, token, expiresAt);
      return response;
    }

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing.length > 0)
      return Response.json(
        { error: "An account with that email already exists." },
        { status: 409 },
      );

    const rows = await db
      .insert(users)
      .values({ email, fullName, passwordHash: await hashPassword(password) })
      .returning({ id: users.id, email: users.email, fullName: users.fullName });

    const user = rows[0];
    if (!user) return serverError("Could not create the account.");

    const { token, expiresAt } = await createSession(user.id);
    const response = Response.json({
      user: { id: user.id, email: user.email, fullName: user.fullName },
    });
    setSessionCookie(response, token, expiresAt);
    return response;
  } catch (error) {
    logDatabaseError("registration failed", error);
    return serverError("Could not create the account.");
  }
}
