/**
 * GET  /api/datasets — list the signed-in user's uploaded datasets (metadata
 * only; records live in their own table and are paged on the detail route).
 * POST /api/datasets — upload + process a dataset file (DOCX, PDF, CSV,
 * XLSX, JSON, XML, TXT …), then persist the normalised records.
 */
import {
  createDataset,
  insertDatasetRecords,
  listDatasets,
  updateDataset,
} from "@/services/server/repository";
import { currentUser, unauthorized, serverError } from "@/services/server/guard";
import { ingestDataset, toRecordRows } from "@/services/dataset/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  try {
    return Response.json({ datasets: await listDatasets(user.id) });
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

  const row = await createDataset(user.id, {
    fileName,
    displayName: fileName,
    kind: "unknown",
    mimeType,
    fileSizeBytes: bytes.length,
    status: "processing",
    statusDetail: "Processing your dataset…",
  });

  if (!row) return serverError("Could not start the upload.");

  const result = await ingestDataset(bytes, fileName, mimeType);

  if (result.records.length > 0) {
    const inserted = await insertDatasetRecords(row.id, toRecordRows(row.id, result.records));
    if (!inserted) {
      await updateDataset(user.id, row.id, {
        status: "failed",
        statusDetail: "The dataset was read but its records could not be saved.",
      });
      return serverError("The dataset records could not be saved.");
    }
  }

  const updated = await updateDataset(user.id, row.id, {
    kind: result.kind,
    status: result.status,
    statusDetail: result.statusDetail,
    recordCount: result.recordCount,
    columns: result.columns,
    quality: result.quality as unknown as Record<string, unknown> | null,
    statistics: result.statistics as unknown as Record<string, unknown> | null,
    previewRows: result.previewRows,
    warnings: result.warnings,
  });

  return Response.json({ dataset: updated ?? row, result: {
    status: result.status,
    statusDetail: result.statusDetail,
    recordCount: result.recordCount,
    columns: result.columns,
    previewRows: result.previewRows,
    warnings: result.warnings,
  } });
}
