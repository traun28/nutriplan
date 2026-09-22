/**
 * Phase 7 — server-side queries over dataset_records.
 *
 * Every function takes the session user id and re-checks dataset ownership
 * before touching records (client-supplied ids are never trusted). Search,
 * filters, sorting, pagination and aggregation run in SQL so large datasets
 * never have to be shipped to the browser.
 */
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db, hasDatabase } from "@/db";
import { datasetRecords, datasets } from "@/db/schema";
import type { DatasetParticipant } from "@/data/dataset/schema";
import { getDevDataset, getDevDatasetRecords } from "@/services/server/devStore";
import { deriveRecordFields, type NutritionStatus, type RecordStatus } from "@/services/dataset/validation";

export type DatasetRecordRow = typeof datasetRecords.$inferSelect;

/* ------------------------------------------------------------------ */
/* Query model                                                         */
/* ------------------------------------------------------------------ */

export const SORTABLE_FIELDS = ["rowIndex", "participantId", "name", "age", "heightCm", "weightKg", "bmi", "calories", "protein", "recordStatus"] as const;
export type SortField = (typeof SORTABLE_FIELDS)[number];

export interface RecordQuery {
  search?: string;
  ageMin?: number | null;
  ageMax?: number | null;
  bmiMin?: number | null;
  bmiMax?: number | null;
  gender?: string | null;
  recordStatus?: RecordStatus | null;
  qualityStatus?: string | null;
  nutritionStatus?: NutritionStatus | null;
  incompleteOnly?: boolean;
  includeExcluded?: boolean;
  reviewed?: boolean | null;
  sort?: SortField;
  direction?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

const RECORD_STATUSES: RecordStatus[] = ["complete", "incomplete", "needs_review"];
const NUTRITION_STATUSES: NutritionStatus[] = ["below_target", "adequate", "above_reference", "not_assessable"];
const QUALITY_STATUSES = ["clean", "needs_review", "missing_value", "parse_error", "ambiguous"];

function num(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Parses + clamps query-string parameters into a safe RecordQuery. */
export function parseRecordQuery(params: URLSearchParams): RecordQuery {
  const sortRaw = params.get("sort") ?? "rowIndex";
  const sort = (SORTABLE_FIELDS as readonly string[]).includes(sortRaw) ? (sortRaw as SortField) : "rowIndex";
  const recordStatus = params.get("recordStatus");
  const nutritionStatus = params.get("nutritionStatus");
  const qualityStatus = params.get("qualityStatus");
  const reviewedRaw = params.get("reviewed");
  const page = Math.max(1, Math.floor(num(params.get("page")) ?? 1));
  const pageSize = Math.min(100, Math.max(5, Math.floor(num(params.get("pageSize")) ?? 25)));
  return {
    search: (params.get("search") ?? "").trim().slice(0, 80),
    ageMin: num(params.get("ageMin")),
    ageMax: num(params.get("ageMax")),
    bmiMin: num(params.get("bmiMin")),
    bmiMax: num(params.get("bmiMax")),
    gender: (params.get("gender") ?? "").trim().slice(0, 40) || null,
    recordStatus: recordStatus && RECORD_STATUSES.includes(recordStatus as RecordStatus) ? (recordStatus as RecordStatus) : null,
    qualityStatus: qualityStatus && QUALITY_STATUSES.includes(qualityStatus) ? qualityStatus : null,
    nutritionStatus: nutritionStatus && NUTRITION_STATUSES.includes(nutritionStatus as NutritionStatus) ? (nutritionStatus as NutritionStatus) : null,
    incompleteOnly: params.get("incomplete") === "1",
    includeExcluded: params.get("includeExcluded") === "1",
    reviewed: reviewedRaw === "1" ? true : reviewedRaw === "0" ? false : null,
    sort,
    direction: params.get("direction") === "desc" ? "desc" : "asc",
    page,
    pageSize,
  };
}

/** Human-readable description of the active filters (for exports/reports). */
export function describeQuery(q: RecordQuery): string[] {
  const parts: string[] = [];
  if (q.search) parts.push(`Search: "${q.search}"`);
  if (q.ageMin !== null && q.ageMin !== undefined) parts.push(`Age ≥ ${q.ageMin}`);
  if (q.ageMax !== null && q.ageMax !== undefined) parts.push(`Age ≤ ${q.ageMax}`);
  if (q.bmiMin !== null && q.bmiMin !== undefined) parts.push(`BMI ≥ ${q.bmiMin}`);
  if (q.bmiMax !== null && q.bmiMax !== undefined) parts.push(`BMI ≤ ${q.bmiMax}`);
  if (q.gender) parts.push(`Gender: ${q.gender}`);
  if (q.recordStatus) parts.push(`Record status: ${q.recordStatus.replace("_", " ")}`);
  if (q.qualityStatus) parts.push(`Quality: ${q.qualityStatus.replace("_", " ")}`);
  if (q.nutritionStatus) parts.push(`Nutrition: ${q.nutritionStatus.replace("_", " ")}`);
  if (q.incompleteOnly) parts.push("Incomplete records only");
  if (q.reviewed === true) parts.push("Reviewed only");
  if (q.reviewed === false) parts.push("Not yet reviewed");
  if (q.includeExcluded) parts.push("Including excluded records");
  return parts;
}

/* ------------------------------------------------------------------ */
/* SQL building                                                        */
/* ------------------------------------------------------------------ */

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

function whereFor(datasetId: number, q: RecordQuery): SQL {
  const clauses: SQL[] = [eq(datasetRecords.datasetId, datasetId)];
  if (!q.includeExcluded) clauses.push(or(isNull(datasetRecords.excluded), eq(datasetRecords.excluded, false))!);
  if (q.search) {
    const pattern = `%${escapeLike(q.search)}%`;
    clauses.push(or(ilike(datasetRecords.participantId, pattern), ilike(datasetRecords.name, pattern))!);
  }
  if (q.ageMin != null) clauses.push(gte(datasetRecords.age, q.ageMin));
  if (q.ageMax != null) clauses.push(lte(datasetRecords.age, q.ageMax));
  if (q.bmiMin != null) clauses.push(gte(datasetRecords.bmi, q.bmiMin));
  if (q.bmiMax != null) clauses.push(lte(datasetRecords.bmi, q.bmiMax));
  if (q.gender) clauses.push(ilike(datasetRecords.gender, escapeLike(q.gender)));
  if (q.recordStatus) clauses.push(eq(datasetRecords.recordStatus, q.recordStatus));
  if (q.qualityStatus) clauses.push(eq(datasetRecords.qualityStatus, q.qualityStatus));
  if (q.nutritionStatus) clauses.push(eq(datasetRecords.nutritionStatus, q.nutritionStatus));
  if (q.incompleteOnly) clauses.push(inArray(datasetRecords.recordStatus, ["incomplete", "needs_review"]));
  if (q.reviewed === true) clauses.push(eq(datasetRecords.reviewed, true));
  if (q.reviewed === false) clauses.push(or(isNull(datasetRecords.reviewed), eq(datasetRecords.reviewed, false))!);
  return and(...clauses)!;
}

function orderFor(q: RecordQuery): SQL[] {
  const col = {
    rowIndex: datasetRecords.rowIndex,
    participantId: datasetRecords.participantId,
    name: datasetRecords.name,
    age: datasetRecords.age,
    heightCm: datasetRecords.heightCm,
    weightKg: datasetRecords.weightKg,
    bmi: datasetRecords.bmi,
    calories: datasetRecords.calories,
    protein: datasetRecords.protein,
    recordStatus: datasetRecords.recordStatus,
  }[q.sort ?? "rowIndex"];
  const dir = q.direction === "desc" ? desc : asc;
  // Nulls last in both directions; row index as a stable tie-breaker.
  return [sql`${col} IS NULL`, dir(col), asc(datasetRecords.rowIndex)];
}

/* ------------------------------------------------------------------ */
/* Dev (no database) fallback                                          */
/* ------------------------------------------------------------------ */

function devRows(userId: number, datasetId: number): DatasetRecordRow[] {
  const { rows } = getDevDatasetRecords(userId, datasetId, 100000, 0);
  return rows.map((r) => {
    const data = r.data as DatasetParticipant;
    const derived = deriveRecordFields(data);
    return {
      ...r,
      activityLevel: data.activityLevel,
      participantId: data.participantId || null,
      name: data.name || null,
      gender: data.genderSource || null,
      bmi: derived.bmi,
      recordStatus: derived.recordStatus,
      nutritionStatus: derived.nutritionStatus,
      reviewed: false,
      reviewedAt: null,
      excluded: false,
      reviewNote: null,
      editedAt: null,
      editHistory: null,
    } as DatasetRecordRow;
  });
}

function devFilter(rows: DatasetRecordRow[], q: RecordQuery): DatasetRecordRow[] {
  const s = (q.search ?? "").toLowerCase();
  const out = rows.filter((r) => {
    if (!q.includeExcluded && r.excluded) return false;
    if (s && !((r.participantId ?? "").toLowerCase().includes(s) || (r.name ?? "").toLowerCase().includes(s))) return false;
    if (q.ageMin != null && (r.age === null || r.age < q.ageMin)) return false;
    if (q.ageMax != null && (r.age === null || r.age > q.ageMax)) return false;
    if (q.bmiMin != null && (r.bmi === null || r.bmi < q.bmiMin)) return false;
    if (q.bmiMax != null && (r.bmi === null || r.bmi > q.bmiMax)) return false;
    if (q.gender && (r.gender ?? "").toLowerCase() !== q.gender.toLowerCase()) return false;
    if (q.recordStatus && r.recordStatus !== q.recordStatus) return false;
    if (q.qualityStatus && r.qualityStatus !== q.qualityStatus) return false;
    if (q.nutritionStatus && r.nutritionStatus !== q.nutritionStatus) return false;
    if (q.incompleteOnly && r.recordStatus === "complete") return false;
    if (q.reviewed === true && !r.reviewed) return false;
    if (q.reviewed === false && r.reviewed) return false;
    return true;
  });
  const key = q.sort ?? "rowIndex";
  const dir = q.direction === "desc" ? -1 : 1;
  out.sort((a, b) => {
    const av = a[key] as number | string | null;
    const bv = b[key] as number | string | null;
    if (av === null && bv === null) return a.rowIndex - b.rowIndex;
    if (av === null) return 1;
    if (bv === null) return -1;
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return a.rowIndex - b.rowIndex;
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* Ownership                                                           */
/* ------------------------------------------------------------------ */

export async function ownsDataset(userId: number, datasetId: number): Promise<boolean> {
  if (!hasDatabase) return Boolean(getDevDataset(userId, datasetId));
  try {
    const rows = await db.select({ id: datasets.id }).from(datasets).where(and(eq(datasets.id, datasetId), eq(datasets.userId, userId))).limit(1);
    return rows.length > 0;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Paged listing                                                       */
/* ------------------------------------------------------------------ */

export interface RecordPage {
  rows: DatasetRecordRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function queryRecords(userId: number, datasetId: number, q: RecordQuery): Promise<RecordPage | null> {
  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? 25;
  if (!(await ownsDataset(userId, datasetId))) return null;

  if (!hasDatabase) {
    const filtered = devFilter(devRows(userId, datasetId), q);
    const total = filtered.length;
    return { rows: filtered.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }
  try {
    const where = whereFor(datasetId, q);
    const [{ value: total }] = await db.select({ value: count() }).from(datasetRecords).where(where);
    const rows = await db.select().from(datasetRecords).where(where).orderBy(...orderFor(q)).limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  } catch {
    return { rows: [], total: 0, page, pageSize, totalPages: 1 };
  }
}

/** Streams every matching row in chunks (exports, gap analysis). */
export async function forEachRecord(
  userId: number,
  datasetId: number,
  q: RecordQuery,
  visit: (row: DatasetRecordRow) => void,
  chunk = 500,
): Promise<boolean> {
  if (!(await ownsDataset(userId, datasetId))) return false;
  if (!hasDatabase) {
    devFilter(devRows(userId, datasetId), q).forEach(visit);
    return true;
  }
  const where = whereFor(datasetId, q);
  let offset = 0;
  for (;;) {
    const rows = await db.select().from(datasetRecords).where(where).orderBy(...orderFor(q)).limit(chunk).offset(offset);
    rows.forEach(visit);
    if (rows.length < chunk) break;
    offset += chunk;
  }
  return true;
}

export async function getRecord(userId: number, datasetId: number, recordId: number): Promise<DatasetRecordRow | null> {
  if (!(await ownsDataset(userId, datasetId))) return null;
  if (!hasDatabase) return devRows(userId, datasetId).find((r) => r.id === recordId) ?? null;
  try {
    const rows = await db.select().from(datasetRecords).where(and(eq(datasetRecords.id, recordId), eq(datasetRecords.datasetId, datasetId))).limit(1);
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function updateRecord(
  userId: number,
  datasetId: number,
  recordId: number,
  values: Partial<typeof datasetRecords.$inferInsert>,
): Promise<DatasetRecordRow | null> {
  if (!(await ownsDataset(userId, datasetId))) return null;
  if (!hasDatabase) return null; // editing is only supported with a database
  try {
    const rows = await db.update(datasetRecords).set(values).where(and(eq(datasetRecords.id, recordId), eq(datasetRecords.datasetId, datasetId))).returning();
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Aggregates                                                          */
/* ------------------------------------------------------------------ */

export interface NumericSummary {
  count: number;
  mean: number | null;
  min: number | null;
  max: number | null;
}

export interface Aggregates {
  total: number;
  excluded: number;
  reviewed: number;
  recordStatus: Record<RecordStatus, number>;
  nutritionStatus: Record<NutritionStatus, number>;
  qualityStatus: Record<string, number>;
  gender: Array<{ label: string; count: number }>;
  age: NumericSummary;
  heightCm: NumericSummary;
  weightKg: NumericSummary;
  bmi: NumericSummary;
  calories: NumericSummary;
  protein: NumericSummary;
  potentialOutliers: number;
}

function summarise(values: number[]): NumericSummary {
  if (values.length === 0) return { count: 0, mean: null, min: null, max: null };
  const sum = values.reduce((a, b) => a + b, 0);
  return { count: values.length, mean: Math.round((sum / values.length) * 10) / 10, min: Math.min(...values), max: Math.max(...values) };
}

function emptyAggregates(): Aggregates {
  return {
    total: 0, excluded: 0, reviewed: 0,
    recordStatus: { complete: 0, incomplete: 0, needs_review: 0 },
    nutritionStatus: { below_target: 0, adequate: 0, above_reference: 0, not_assessable: 0 },
    qualityStatus: {}, gender: [],
    age: summarise([]), heightCm: summarise([]), weightKg: summarise([]), bmi: summarise([]), calories: summarise([]), protein: summarise([]),
    potentialOutliers: 0,
  };
}

export async function aggregateRecords(userId: number, datasetId: number, q: RecordQuery): Promise<Aggregates | null> {
  if (!(await ownsDataset(userId, datasetId))) return null;
  const agg = emptyAggregates();

  if (!hasDatabase) {
    const all = devRows(userId, datasetId);
    const rows = devFilter(all, q);
    agg.total = rows.length;
    const pick = (k: keyof DatasetRecordRow) => rows.map((r) => r[k]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    agg.age = summarise(pick("age")); agg.heightCm = summarise(pick("heightCm")); agg.weightKg = summarise(pick("weightKg"));
    agg.bmi = summarise(pick("bmi")); agg.calories = summarise(pick("calories")); agg.protein = summarise(pick("protein"));
    const genders = new Map<string, number>();
    for (const r of rows) {
      agg.recordStatus[(r.recordStatus ?? "incomplete") as RecordStatus] += 1;
      agg.nutritionStatus[(r.nutritionStatus ?? "not_assessable") as NutritionStatus] += 1;
      agg.qualityStatus[r.qualityStatus] = (agg.qualityStatus[r.qualityStatus] ?? 0) + 1;
      const g = r.gender || "Not recorded";
      genders.set(g, (genders.get(g) ?? 0) + 1);
      if (((r.data as DatasetParticipant).outliers ?? []).length > 0) agg.potentialOutliers += 1;
    }
    agg.gender = [...genders].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
    return agg;
  }

  try {
    const where = whereFor(datasetId, q);
    const numeric = (col: PgColumn) =>
      db.select({
        count: count(col),
        mean: sql<number | null>`round(avg(${col})::numeric, 1)`,
        min: sql<number | null>`min(${col})`,
        max: sql<number | null>`max(${col})`,
      }).from(datasetRecords).where(where);
    const toSummary = (r: { count: number; mean: number | null; min: number | null; max: number | null }): NumericSummary => ({
      count: Number(r.count), mean: r.mean === null ? null : Number(r.mean), min: r.min === null ? null : Number(r.min), max: r.max === null ? null : Number(r.max),
    });
    const [[total], [age], [height], [weight], [bmi], [calories], [protein], statusRows, nutritionRows, qualityRows, genderRows, [outliers], [reviewed], [excluded]] = await Promise.all([
      db.select({ value: count() }).from(datasetRecords).where(where),
      numeric(datasetRecords.age), numeric(datasetRecords.heightCm), numeric(datasetRecords.weightKg), numeric(datasetRecords.bmi), numeric(datasetRecords.calories), numeric(datasetRecords.protein),
      db.select({ key: datasetRecords.recordStatus, value: count() }).from(datasetRecords).where(where).groupBy(datasetRecords.recordStatus),
      db.select({ key: datasetRecords.nutritionStatus, value: count() }).from(datasetRecords).where(where).groupBy(datasetRecords.nutritionStatus),
      db.select({ key: datasetRecords.qualityStatus, value: count() }).from(datasetRecords).where(where).groupBy(datasetRecords.qualityStatus),
      db.select({ key: datasetRecords.gender, value: count() }).from(datasetRecords).where(where).groupBy(datasetRecords.gender),
      db.select({ value: count() }).from(datasetRecords).where(and(where, sql`jsonb_array_length(coalesce(${datasetRecords.data}->'outliers', '[]'::jsonb)) > 0`)),
      db.select({ value: count() }).from(datasetRecords).where(and(where, eq(datasetRecords.reviewed, true))),
      db.select({ value: count() }).from(datasetRecords).where(and(eq(datasetRecords.datasetId, datasetId), eq(datasetRecords.excluded, true))),
    ]);
    agg.total = Number(total.value);
    agg.age = toSummary(age); agg.heightCm = toSummary(height); agg.weightKg = toSummary(weight);
    agg.bmi = toSummary(bmi); agg.calories = toSummary(calories); agg.protein = toSummary(protein);
    for (const r of statusRows) agg.recordStatus[((r.key ?? "incomplete") as RecordStatus)] = (agg.recordStatus[(r.key ?? "incomplete") as RecordStatus] ?? 0) + Number(r.value);
    for (const r of nutritionRows) agg.nutritionStatus[((r.key ?? "not_assessable") as NutritionStatus)] = (agg.nutritionStatus[(r.key ?? "not_assessable") as NutritionStatus] ?? 0) + Number(r.value);
    for (const r of qualityRows) agg.qualityStatus[r.key] = Number(r.value);
    agg.gender = genderRows.map((r) => ({ label: r.key || "Not recorded", count: Number(r.value) })).sort((a, b) => b.count - a.count);
    agg.potentialOutliers = Number(outliers.value);
    agg.reviewed = Number(reviewed.value);
    agg.excluded = Number(excluded.value);
    return agg;
  } catch {
    return agg;
  }
}

/* ------------------------------------------------------------------ */
/* Distributions (histogram buckets computed in SQL)                   */
/* ------------------------------------------------------------------ */

export interface Bucket { label: string; count: number }

export interface Distributions {
  age: Bucket[];
  weightKg: Bucket[];
  heightCm: Bucket[];
  bmi: Bucket[];
  calories: Bucket[];
  protein: Bucket[];
}

const BUCKETS: Record<keyof Distributions, { col: keyof DatasetRecordRow; edges: number[]; unit: string }> = {
  age: { col: "age", edges: [10, 15, 18, 21, 25, 30, 40, 50, 65, 101], unit: "y" },
  weightKg: { col: "weightKg", edges: [30, 40, 50, 60, 70, 80, 90, 100, 120, 201], unit: "kg" },
  heightCm: { col: "heightCm", edges: [120, 140, 150, 160, 170, 180, 190, 221], unit: "cm" },
  bmi: { col: "bmi", edges: [10, 18.5, 25, 30, 35, 60], unit: "" },
  calories: { col: "calories", edges: [0, 1000, 1500, 2000, 2500, 3000, 3500, 6001], unit: "kcal" },
  protein: { col: "protein", edges: [0, 30, 45, 60, 75, 90, 120, 400], unit: "g" },
};

function bucketLabels(edges: number[], unit: string): string[] {
  const labels: string[] = [];
  for (let i = 0; i < edges.length - 1; i += 1) {
    const lo = edges[i];
    const hi = edges[i + 1];
    labels.push(i === edges.length - 2 ? `${lo}+${unit ? " " + unit : ""}` : `${lo}–${Number.isInteger(hi) ? hi - 1 : hi}${unit ? " " + unit : ""}`);
  }
  return labels;
}

function bucketOf(value: number, edges: number[]): number {
  if (value < edges[0]) return 0;
  for (let i = 0; i < edges.length - 1; i += 1) if (value < edges[i + 1]) return i;
  return edges.length - 2;
}

export async function distributionRecords(userId: number, datasetId: number, q: RecordQuery): Promise<Distributions | null> {
  if (!(await ownsDataset(userId, datasetId))) return null;
  const result = {} as Distributions;
  for (const key of Object.keys(BUCKETS) as Array<keyof Distributions>) {
    const { edges, unit } = BUCKETS[key];
    result[key] = bucketLabels(edges, unit).map((label) => ({ label, count: 0 }));
  }

  if (!hasDatabase) {
    const rows = devFilter(devRows(userId, datasetId), q);
    for (const key of Object.keys(BUCKETS) as Array<keyof Distributions>) {
      const { col, edges } = BUCKETS[key];
      for (const r of rows) {
        const v = r[col];
        if (typeof v === "number" && Number.isFinite(v)) result[key][bucketOf(v, edges)].count += 1;
      }
    }
    return result;
  }

  try {
    const where = whereFor(datasetId, q);
    const columns = { age: datasetRecords.age, weightKg: datasetRecords.weightKg, heightCm: datasetRecords.heightCm, bmi: datasetRecords.bmi, calories: datasetRecords.calories, protein: datasetRecords.protein };
    await Promise.all(
      (Object.keys(BUCKETS) as Array<keyof Distributions>).map(async (key) => {
        const { edges } = BUCKETS[key];
        const col = columns[key];
        const arrayLiteral = sql.raw(`ARRAY[${edges.map((e) => Number(e)).join(", ")}]::double precision[]`);
        const bucketExpr = sql<number>`width_bucket(${col}::double precision, ${arrayLiteral})`;
        const rows = await db
          .select({ bucket: bucketExpr.as("bucket"), value: count() })
          .from(datasetRecords)
          .where(and(where, sql`${col} IS NOT NULL`))
          .groupBy(sql`bucket`);
        for (const r of rows) {
          // width_bucket returns 0 below the first edge and edges.length above the last.
          const idx = Math.min(Math.max(Number(r.bucket) - 1, 0), edges.length - 2);
          result[key][idx].count += Number(r.value);
        }
      }),
    );
    return result;
  } catch {
    return result;
  }
}

/* ------------------------------------------------------------------ */
/* Group comparison (no ranking — descriptive means side by side)      */
/* ------------------------------------------------------------------ */

export interface GroupStats {
  label: string;
  count: number;
  age: number | null;
  bmi: number | null;
  calories: number | null;
  protein: number | null;
}

export async function compareGroups(userId: number, datasetId: number, q: RecordQuery, by: "gender" | "recordStatus" | "nutritionStatus" | "activityLevel"): Promise<GroupStats[] | null> {
  if (!(await ownsDataset(userId, datasetId))) return null;
  if (!hasDatabase) {
    const rows = devFilter(devRows(userId, datasetId), q);
    const groups = new Map<string, DatasetRecordRow[]>();
    for (const r of rows) {
      const k = String(r[by] ?? "Not recorded") || "Not recorded";
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    const mean = (xs: DatasetRecordRow[], k: keyof DatasetRecordRow) => summarise(xs.map((x) => x[k]).filter((v): v is number => typeof v === "number")).mean;
    return [...groups].map(([label, xs]) => ({ label, count: xs.length, age: mean(xs, "age"), bmi: mean(xs, "bmi"), calories: mean(xs, "calories"), protein: mean(xs, "protein") }));
  }
  try {
    const col = { gender: datasetRecords.gender, recordStatus: datasetRecords.recordStatus, nutritionStatus: datasetRecords.nutritionStatus, activityLevel: datasetRecords.activityLevel }[by];
    const rows = await db
      .select({
        label: col,
        count: count(),
        age: sql<number | null>`round(avg(${datasetRecords.age})::numeric, 1)`,
        bmi: sql<number | null>`round(avg(${datasetRecords.bmi})::numeric, 1)`,
        calories: sql<number | null>`round(avg(${datasetRecords.calories})::numeric, 1)`,
        protein: sql<number | null>`round(avg(${datasetRecords.protein})::numeric, 1)`,
      })
      .from(datasetRecords)
      .where(whereFor(datasetId, q))
      .groupBy(col)
      .orderBy(desc(count()));
    const n = (v: number | null) => (v === null ? null : Number(v));
    return rows.map((r) => ({ label: r.label || "Not recorded", count: Number(r.count), age: n(r.age), bmi: n(r.bmi), calories: n(r.calories), protein: n(r.protein) }));
  } catch {
    return [];
  }
}

/** Bulk insert with Phase 7 derived columns (chunked). */
export async function insertRecordRows(rows: Array<typeof datasetRecords.$inferInsert>): Promise<boolean> {
  if (rows.length === 0) return true;
  if (!hasDatabase) return false;
  try {
    for (let i = 0; i < rows.length; i += 200) await db.insert(datasetRecords).values(rows.slice(i, i + 200));
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Backfill for records imported before Phase 7                         */
/* ------------------------------------------------------------------ */

/**
 * Older rows have null derived columns (bmi, record_status …). Fill them
 * once, from the stored normalised record — values are derived, never
 * invented, and the source `data` is untouched.
 */
export async function backfillDerivedColumns(userId: number, datasetId: number): Promise<void> {
  if (!hasDatabase) return;
  if (!(await ownsDataset(userId, datasetId))) return;
  try {
    const pending = await db
      .select({ id: datasetRecords.id, data: datasetRecords.data })
      .from(datasetRecords)
      .where(and(eq(datasetRecords.datasetId, datasetId), isNull(datasetRecords.recordStatus)))
      .limit(2000);
    for (const row of pending) {
      const data = row.data as DatasetParticipant;
      if (!data || typeof data !== "object" || !data.quality) continue;
      const derived = deriveRecordFields(data);
      await db.update(datasetRecords).set({
        participantId: data.participantId || null,
        name: data.name || null,
        gender: data.genderSource || null,
        bmi: derived.bmi,
        recordStatus: derived.recordStatus,
        nutritionStatus: derived.nutritionStatus,
        reviewed: false,
        excluded: false,
      }).where(eq(datasetRecords.id, row.id));
    }
  } catch {
    // Best effort; the list still renders with whatever columns exist.
  }
}
