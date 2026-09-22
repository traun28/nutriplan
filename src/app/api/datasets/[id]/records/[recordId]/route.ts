/**
 * GET   /api/datasets/:id/records/:recordId — individual student view
 * PATCH /api/datasets/:id/records/:recordId — validated edit / review controls
 *   body: { fields?: { [field]: value }, reviewed?: boolean, excluded?: boolean, note?: string }
 *
 * Edits re-run the SAME normaliser used at import, so a corrected record is
 * re-validated (quality flags, BMI, statuses) rather than trusted. Previous
 * values are appended to edit_history; nothing is deleted.
 */
import { currentUser, unauthorized, badRequest, notFound, readJson } from "@/services/server/guard";
import { getRecord, updateRecord, type DatasetRecordRow } from "@/services/server/datasetRecordRepository";
import { deriveRecordFields, validateFieldValue, FIELD_CATALOGUE } from "@/services/dataset/validation";
import { buildColumnIndex, normaliseRecord } from "@/data/dataset/normalizer";
import { calorieReferenceFor, analyzeDataset } from "@/services/dataset/nutritionGapAnalysis";
import { calculateBmi } from "@/services/nutrition/bmi";
import { toRecordRow } from "@/services/dataset/ingest";
import type { DatasetParticipant } from "@/data/dataset/schema";
import { statsCache } from "@/services/dataset/statsCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; recordId: string }> };

function detail(row: DatasetRecordRow) {
  const data = row.data as DatasetParticipant;
  const bmi = calculateBmi(row.weightKg ?? data.weightKg, row.heightCm ?? data.heightCm);
  const analysis = analyzeDataset([data]).participants[0];
  const calorieReference = calorieReferenceFor(data);
  return {
    id: row.id,
    rowIndex: row.rowIndex,
    profile: {
      participantId: data.participantId,
      name: data.name,
      age: data.age,
      gender: data.genderSource,
      activityLevel: data.activityLevelSource,
      activityMapped: data.activityLevel,
    },
    measurements: {
      heightCm: data.heightCm,
      weightKg: data.weightKg,
      bmi: bmi ? { value: bmi.value, category: bmi.category, label: bmi.categoryLabel } : null,
    },
    nutrition: {
      recorded: data.nutrition,
      diagnostics: data.nutritionDiagnostics,
      calculatedReference: {
        caloriesKcal: calorieReference,
        available: calorieReference !== null,
        note: calorieReference === null
          ? "A calculated reference needs valid age, height, weight and activity level."
          : "Calculated with the same energy model used for personal plans. It is a reference, not a prescription.",
      },
      status: row.nutritionStatus ?? "not_assessable",
      assessment: analysis?.nutrients ?? [],
    },
    meals: data.meals,
    quality: {
      recordStatus: row.recordStatus ?? deriveRecordFields(data).recordStatus,
      qualityStatus: row.qualityStatus,
      issues: row.issues ?? data.quality.issues,
      outliers: data.outliers ?? [],
      reviewed: row.reviewed === true,
      reviewedAt: row.reviewedAt,
      excluded: row.excluded === true,
      note: row.reviewNote ?? "",
      editedAt: row.editedAt,
      editHistory: row.editHistory ?? [],
    },
    source: { row: data.sourceMetadata?.sourceRow ?? row.rowIndex + 1, importedAt: data.sourceMetadata?.importedAt ?? null },
  };
}

async function load(params: Params["params"]) {
  const user = await currentUser();
  if (!user) return { error: unauthorized() };
  const { id, recordId } = await params;
  const datasetId = Number(id);
  const rid = Number(recordId);
  if (!Number.isInteger(datasetId) || !Number.isInteger(rid)) return { error: badRequest("Invalid id.") };
  const row = await getRecord(user.id, datasetId, rid);
  if (!row) return { error: notFound("That record could not be found.") };
  return { user, datasetId, rid, row };
}

export async function GET(_request: Request, { params }: Params) {
  const ctx = await load(params);
  if ("error" in ctx) return ctx.error;
  return Response.json({ record: detail(ctx.row) });
}

const EDITABLE = new Set(FIELD_CATALOGUE.map((f) => f.field));

export async function PATCH(request: Request, { params }: Params) {
  const ctx = await load(params);
  if ("error" in ctx) return ctx.error;
  const body = await readJson<{ fields?: Record<string, unknown>; reviewed?: unknown; excluded?: unknown; note?: unknown }>(request);
  if (!body) return badRequest("Invalid request body.");

  const { row, user, datasetId, rid } = ctx;
  const data = row.data as DatasetParticipant;
  const values: Record<string, unknown> = {};
  const history = [...(row.editHistory ?? [])];
  const now = new Date();

  if (body.fields !== undefined) {
    if (typeof body.fields !== "object" || body.fields === null || Array.isArray(body.fields)) return badRequest("fields must be an object.");
    const entries = Object.entries(body.fields);
    if (entries.length === 0) return badRequest("No fields to update.");
    if (entries.length > 20) return badRequest("Too many fields in one edit.");

    // Rebuild a raw row from the current record + edits, then re-normalise so
    // every rule (numeric, sign, outliers, consistency) is re-applied.
    const raw: Record<string, string> = {
      participantId: data.participantId,
      name: data.name,
      age: data.age === null ? "" : String(data.age),
      gender: data.genderSource,
      heightCm: data.heightCm === null ? "" : String(data.heightCm),
      weightKg: data.weightKg === null ? "" : String(data.weightKg),
      activityLevel: data.activityLevelSource,
      breakfast: data.meals.breakfast.join(", "),
      lunch: data.meals.lunch.join(", "),
      dinner: data.meals.dinner.join(", "),
      snacks: data.meals.snacks.join(", "),
    };
    for (const [k, v] of Object.entries(data.nutrition)) raw[k] = v === null ? "" : String(v);

    const errors: Record<string, string> = {};
    for (const [field, value] of entries) {
      if (!EDITABLE.has(field)) { errors[field] = "This field cannot be edited."; continue; }
      const check = validateFieldValue(field, value);
      if (!check.ok) { errors[field] = check.message; continue; }
      const next = check.value === null ? "" : String(check.value);
      if (raw[field] !== next) {
        history.push({ at: now.toISOString(), field, from: raw[field] || null, to: next || null });
        raw[field] = next;
      }
    }
    if (Object.keys(errors).length > 0) return Response.json({ error: "Some values are not valid.", fieldErrors: errors }, { status: 422 });

    const headers = Object.keys(raw);
    const { participant } = normaliseRecord({ row: raw, sourcePage: null, sourceRow: data.sourceMetadata?.sourceRow ?? null }, buildColumnIndex(headers), data.sourceMetadata?.importedAt ?? now.toISOString());
    participant.sourceMetadata = { ...data.sourceMetadata, ...participant.sourceMetadata, sourceFile: data.sourceMetadata?.sourceFile ?? participant.sourceMetadata.sourceFile };
    const rebuilt = toRecordRow(datasetId, row.rowIndex, participant);
    Object.assign(values, rebuilt, { editedAt: now, editHistory: history.slice(-50) });
    delete values.datasetId;
    delete values.rowIndex;
  }

  if (body.reviewed !== undefined) {
    if (typeof body.reviewed !== "boolean") return badRequest("reviewed must be true or false.");
    values.reviewed = body.reviewed;
    values.reviewedAt = body.reviewed ? now : null;
  }
  if (body.excluded !== undefined) {
    if (typeof body.excluded !== "boolean") return badRequest("excluded must be true or false.");
    values.excluded = body.excluded;
  }
  if (body.note !== undefined) {
    if (typeof body.note !== "string" || body.note.length > 500) return badRequest("note must be text up to 500 characters.");
    values.reviewNote = body.note.trim();
  }
  if (Object.keys(values).length === 0) return badRequest("Nothing to update.");

  const updated = await updateRecord(user.id, datasetId, rid, values);
  if (!updated) return Response.json({ error: "The record could not be updated." }, { status: 500 });
  statsCache.bust(user.id, datasetId);
  return Response.json({ record: detail(updated) });
}
