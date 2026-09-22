/** Phase 4 — POST /api/grocery/clear-purchased → removes purchased items. */
import { currentUser, errorResponse, unauthorized } from "@/services/server/guard";
import { clearPurchasedItems, getGroceryList } from "@/services/server/kitchenRepository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const user = await currentUser();
  if (!user) return unauthorized();
  try {
    const removed = await clearPurchasedItems(user.id);
    return Response.json({ removed, list: await getGroceryList(user.id) });
  } catch (error) {
    return errorResponse(error);
  }
}
