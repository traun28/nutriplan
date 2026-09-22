/**
 * POST /api/datasets/:id/validate — re-run validation for a staged upload
 * with a user-confirmed column mapping ({ mapping: { header: field } }).
 * Ownership is enforced; the id in the URL is only a lookup key.
 */
import { currentUser, unauthorized, badRequest, readJson } from "@/services/server/guard";
import { revalidate } from "@/services/dataset/importService";
import { KNOWN_FIELDS, type ColumnMapping } from "@/services/dataset/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const datasetId = Number(id);
  if (!Number.isInteger(datasetId)) return badRequest("Invalid dataset id.");

  const body = await readJson<{ mapping?: unknown }>(request);
  let mapping: ColumnMapping | null = null;
  if (body?.mapping !== undefined) {
    if (typeof body.mapping !== "object" || body.mapping === null || Array.isArray(body.mapping)) return badRequest("mapping must be an object of header → field.");
    mapping = {};
    for (const [header, field] of Object.entries(body.mapping as Record<string, unknown>)) {
      if (typeof header !== "string" || header.length > 120) continue;
      if (field === "" || field === null) { mapping[header] = ""; continue; }
      if (typeof field !== "string" || !KNOWN_FIELDS.includes(field)) return badRequest(`"${String(field)}" is not a known dataset field.`);
      mapping[header] = field;
    }
  }

  const result = await revalidate(user.id, datasetId, mapping);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ dataset: result.dataset, report: result.report });
}
