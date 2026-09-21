import { createDataset, insertDatasetRecords, updateDataset } from "@/services/server/repository";
import { currentUser, badRequest, serverError, unauthorized } from "@/services/server/guard";
import { normalizeManualStudent, type ManualStudentInput } from "@/services/dataset/manualStudent";
import { buildStatistics } from "@/data/dataset/analytics";
import { buildQualityReport } from "@/data/dataset/validator";
import { toRecordRows } from "@/services/dataset/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  datasetName?: string;
  students?: ManualStudentInput[];
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body || !Array.isArray(body.students) || body.students.length === 0) {
    return badRequest("Add at least one student before saving the dataset.");
  }
  const students = body.students.slice(0, 2000).map(normalizeManualStudent);
  const quality = buildQualityReport(students);
  const statistics = buildStatistics(students);
  const name = body.datasetName?.trim() || "Manual student dataset";
  const row = await createDataset(user.id, {
    fileName: name,
    displayName: name,
    kind: "manual",
    mimeType: "application/json",
    fileSizeBytes: 0,
    status: quality.cleanRecords > 0 ? "ready" : "needs_review",
    statusDetail: `Saved ${students.length} student record(s).`,
    recordCount: students.length,
    columns: Object.keys(body.students[0] ?? {}),
    quality: quality as unknown as Record<string, unknown>,
    statistics: statistics as unknown as Record<string, unknown>,
    previewRows: [],
    warnings: [],
  });
  if (!row) return serverError("Could not create the dataset.");
  const inserted = await insertDatasetRecords(row.id, toRecordRows(row.id, students));
  if (!inserted) return serverError("The student records could not be saved.");
  const updated = await updateDataset(user.id, row.id, {
    status: quality.cleanRecords > 0 ? "ready" : "needs_review",
    statusDetail: `Saved ${students.length} student record(s).`,
  });
  return Response.json({ dataset: updated ?? row, recordCount: students.length });
}
