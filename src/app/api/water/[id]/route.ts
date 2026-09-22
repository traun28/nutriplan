/**
 * PATCH  /api/water/:id   { amountMl }
 * DELETE /api/water/:id
 */
import { badRequest, currentUser, errorResponse, notFound, readJson, unauthorized } from "@/services/server/guard";
import { deleteWater, updateWater } from "@/services/server/foodLogRepository";
import { validateWaterAmount } from "@/services/foodLog/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(request: Request, context: Context) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const id = parseId((await context.params).id);
  if (!id) return notFound("That water entry could not be found.");
  const body = await readJson<{ amountMl?: unknown }>(request);
  if (!body) return badRequest("Invalid request.");
  const amountError = validateWaterAmount(body.amountMl);
  if (amountError) return badRequest(amountError);
  try {
    const entry = await updateWater(user.id, id, body.amountMl as number);
    if (!entry) return notFound("That water entry could not be found.");
    return Response.json({ entry });
  } catch (error) {
    return errorResponse(error, "Could not update the water entry.");
  }
}

export async function DELETE(_request: Request, context: Context) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const id = parseId((await context.params).id);
  if (!id) return notFound("That water entry could not be found.");
  try {
    const deleted = await deleteWater(user.id, id);
    if (!deleted) return notFound("That water entry could not be found.");
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Could not delete the water entry.");
  }
}
