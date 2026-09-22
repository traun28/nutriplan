/**
 * GET /api/auth/me — resolves the current session.
 *
 * Always answers 200 (`{ user: null }` when unauthenticated) so the client
 * can distinguish AUTHENTICATED / NOT AUTHENTICATED / FAILED instead of
 * guessing from an error status.
 */
import { currentUser, sessionStoreUnavailable } from "@/services/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await currentUser();
    if (!user && (await sessionStoreUnavailable())) {
      return Response.json({ user: null, error: "Could not check your session." });
    }
    return Response.json({ user });
  } catch {
    return Response.json({ user: null, error: "Could not check your session." });
  }
}
