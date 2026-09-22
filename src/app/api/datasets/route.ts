/**
 * GET  /api/datasets — list the signed-in user's uploaded datasets (metadata
 * only; records live in their own table and are paged on the detail route).
 * POST /api/datasets — upload + validate a dataset file (CSV, XLSX, DOCX,
 * PDF, JSON, XML, TXT …). Phase 7: nothing is imported here — the response is
 * a validation report; records are written by POST /api/datasets/:id/import
 * once the user has reviewed the preview and confirmed the column mapping.
 */
import { listDatasets } from "@/services/server/repository";
import { currentUser, unauthorized, serverError } from "@/services/server/guard";
import { publicDataset, stageUpload } from "@/services/dataset/importService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  try {
    return Response.json({ datasets: (await listDatasets(user.id)).map(publicDataset) });
  } catch {
    return serverError("Could not load your datasets.");
  }
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();

  let fileName = "dataset";
  let mimeType = "";
  let bytes: Uint8Array;

  try {
    // Preferred: raw binary upload (used by our client).
    const headerName = request.headers.get("x-file-name");
    if (headerName) {
      fileName = decodeURIComponent(headerName.slice(0, 200));
      mimeType = request.headers.get("x-file-mime") ?? "";
      const buffer = await request.arrayBuffer();
      bytes = new Uint8Array(buffer);
    } else {
      // Also accept a normal multipart form upload.
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return Response.json({ error: "No file was provided." }, { status: 400 });
      }
      fileName = file.name;
      mimeType = file.type;
      bytes = new Uint8Array(await file.arrayBuffer());
    }
  } catch {
    return Response.json({ error: "The upload could not be read." }, { status: 400 });
  }

  if (bytes.length === 0) {
    return Response.json({ error: "The uploaded file is empty." }, { status: 400 });
  }

  // Phase 7: staged workflow — validate now, import only after confirmation.
  const staged = await stageUpload(user.id, bytes, fileName, mimeType);
  if (!staged.ok) {
    return Response.json({ error: staged.error, dataset: staged.dataset ?? null }, { status: staged.status });
  }
  return Response.json({ dataset: staged.dataset, report: staged.report, warnings: staged.fileWarnings ?? [] });
}
