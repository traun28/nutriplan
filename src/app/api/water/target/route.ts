/** PUT /api/water/target — { targetMl } saves the user's daily water target. */
import { badRequest, currentUser, errorResponse, readJson, unauthorized } from "@/services/server/guard";
import { saveSettings } from "@/services/server/foodLogRepository";
import { validateWaterTarget } from "@/services/foodLog/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const body = await readJson<{ targetMl?: unknown }>(request);
  if (!body) return badRequest("Invalid request.");
  const error = validateWaterTarget(body.targetMl);
  if (error) return badRequest(error);
  try {
    const settings = await saveSettings(user.id, { waterTargetMl: body.targetMl as number });
    return Response.json({ targetMl: settings.waterTargetMl });
  } catch (err) {
    return errorResponse(err, "Could not save your water target.");
  }
}
