/**
 * Part 15 — server-side authentication.
 *
 * • Passwords are hashed with scrypt (Node crypto) using a per-user salt.
 *   Never stored or logged in plain text.
 * • Sessions use a random opaque token; only the token's SHA-256 is stored,
 *   so a database leak does not yield usable session tokens.
 * • The cookie is httpOnly + sameSite=lax so it works on the external site
 *   without being readable by JavaScript.
 *
 * Public helpers are safe to call from route handlers only (server).
 */
import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt, lt } from "drizzle-orm";
import { db, hasDatabase } from "@/db";
import { sessions, users } from "@/db/schema";
import {
  deleteDevSession,
  findDevSession,
  findDevUserById,
  saveDevSession,
} from "@/services/server/devStore";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SESSION_DAYS = 30;

export const SESSION_COOKIE = "pdp_session";

/* ------------------------------------------------------------------ */
/* Password hashing                                                    */
/* ------------------------------------------------------------------ */

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  try {
    const salt = Buffer.from(parts[1], "hex");
    const expected = Buffer.from(parts[2], "hex");
    const derived = await scrypt(password, salt, expected.length);
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface SessionUser {
  id: number;
  email: string;
  fullName: string;
}

/** Creates a session row and returns the raw token to set as a cookie. */
export async function createSession(userId: number): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  if (hasDatabase) {
    await db.insert(sessions).values({
      tokenHash: hashToken(token),
      userId,
      expiresAt,
    });
  } else {
    saveDevSession(token, userId, expiresAt);
  }
  return { token, expiresAt };
}

export async function getSessionUser(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  if (!hasDatabase) {
    const session = findDevSession(token);
    const user = session ? findDevUserById(session.userId) : undefined;
    return user ? { id: user.id, email: user.email, fullName: user.fullName } : null;
  }
  try {
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.tokenHash, hashToken(token)),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .limit(1);

    return rows[0] ?? null;
  } catch {
    // Session lookup failure (store unreachable or query error) reads as
    // "no session" here; `unauthorized()` in the guard probes the store so
    // a real outage is still answered with an accurate 503.
    return null;
  }
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  if (!hasDatabase) {
    deleteDevSession(token);
    return;
  }
  try {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  } catch {
    // nothing actionable
  }
}

/** Housekeeping: removes expired sessions. Cheap, non-blocking. */
export async function purgeExpiredSessions(): Promise<void> {
  try {
    await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  } catch {
    // ignore
  }
}

function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}

function serializeOptions(options: Record<string, unknown>): string {
  return Object.entries(options)
    .map(([key, value]) => {
      if (value === true) return key;
      if (value instanceof Date) return `${key}=${value.toUTCString()}`;
      return `${key}=${String(value)}`;
    })
    .join("; ");
}

/** Attaches the session cookie to an outgoing response. */
export function setSessionCookie(
  response: Response,
  token: string,
  expiresAt: Date,
): void {
  response.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; ${serializeOptions(sessionCookieOptions(expiresAt))}`,
  );
}

/** Clears the session cookie (used by logout). */
export function clearSessionCookie(response: Response): void {
  const expired = new Date(0);
  response.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=; ${serializeOptions(sessionCookieOptions(expired))}`,
  );
}
