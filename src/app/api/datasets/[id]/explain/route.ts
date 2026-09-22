/**
 * POST /api/datasets/:id/explain — optional AI explanation of the dataset's
 * SUMMARY statistics (counts, averages, distributions). No names, ids or
 * individual records are ever sent to the provider; the reply is
 * informational text only and never changes any record. Uses the Phase 6
 * provider abstraction (AI_PROVIDER / AI_API_KEY); without a configured
 * provider a deterministic summary is returned and labelled as such.
 */
import { currentUser, unauthorized, badRequest, notFound, readJson } from "@/services/server/guard";
import { aggregateRecords, describeQuery, parseRecordQuery, type Aggregates } from "@/services/server/datasetRecordRepository";
import { getDataset } from "@/services/server/repository";
import { checkRateLimit } from "@/services/server/rateLimit";
import { complete, providerInfo } from "@/services/ai/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function deterministicSummary(a: Aggregates, scope: string): string {
  const parts: string[] = [];
  parts.push(`${scope} contains ${a.total} record(s): ${a.recordStatus.complete} complete, ${a.recordStatus.incomplete} incomplete and ${a.recordStatus.needs_review} needing review.`);
  if (a.bmi.count >= 5 && a.bmi.mean !== null) parts.push(`Across ${a.bmi.count} records with valid height and weight, the average BMI is ${a.bmi.mean} (range ${a.bmi.min}–${a.bmi.max}).`);
  if (a.calories.count >= 5 && a.calories.mean !== null) parts.push(`Recorded calories average ${a.calories.mean} kcal over ${a.calories.count} records.`);
  const assessed = a.total - a.nutritionStatus.not_assessable;
  if (assessed > 0) parts.push(`Of ${assessed} records with a calculated reference, ${a.nutritionStatus.below_target} are below target, ${a.nutritionStatus.adequate} adequate and ${a.nutritionStatus.above_reference} above the reference — a potential gap based on recorded data, not a diagnosis.`);
  if (a.potentialOutliers > 0) parts.push(`${a.potentialOutliers} record(s) contain potential outlier values and should be checked against the source.`);
  return parts.join(" ");
}

export async function POST(request: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const datasetId = Number(id);
  if (!Number.isInteger(datasetId)) return badRequest("Invalid dataset id.");
  const limit = checkRateLimit(`dataset-explain:${user.id}`, 10);
  if (!limit.ok) return Response.json({ error: "Too many requests. Try again shortly." }, { status: 429, headers: { "retry-after": String(limit.retryAfterSec) } });

  const dataset = await getDataset(user.id, datasetId);
  if (!dataset) return notFound("That dataset could not be found.");

  const body = (await readJson<{ filters?: Record<string, string> }>(request)) ?? {};
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(body.filters ?? {})) if (typeof v === "string" && k !== "search") search.set(k.slice(0, 40), v.slice(0, 40));
  const query = parseRecordQuery(search);
  const aggregates = await aggregateRecords(user.id, datasetId, query);
  if (!aggregates) return notFound("That dataset could not be found.");
  const filters = describeQuery(query);
  const scope = filters.length > 0 ? "The selected subset" : "The dataset";
  const fallback = deterministicSummary(aggregates, scope);

  const info = providerInfo();
  if (!info.configured) {
    return Response.json({ source: "rules", provider: null, text: fallback, note: "No AI provider is configured; this is a rule-based summary of the same statistics." });
  }

  try {
    const text = await complete([
      {
        role: "system",
        content: "You explain summary statistics of a student nutrition dataset for an educator. Use only the numbers provided. Do not invent values, do not rank or single out individuals, do not give medical advice or diagnoses; describe BMI and calorie comparisons as screening references. Keep it under 160 words in plain English.",
      },
      {
        role: "user",
        content: `Scope: ${scope}${filters.length ? ` (filters: ${filters.join("; ")})` : ""}.\nSummary statistics (JSON, aggregates only, no personal data): ${JSON.stringify({
          total: aggregates.total,
          recordStatus: aggregates.recordStatus,
          nutritionStatus: aggregates.nutritionStatus,
          potentialOutliers: aggregates.potentialOutliers,
          age: aggregates.age, bmi: aggregates.bmi, calories: aggregates.calories, protein: aggregates.protein,
          genderCounts: aggregates.gender.map((g) => ({ label: g.label, count: g.count })),
        })}`,
      },
    ]);
    return Response.json({ source: "ai", provider: info.name, text: text.trim().slice(0, 2000), note: "AI-generated explanation of summary statistics. It does not change any record." });
  } catch {
    return Response.json({ source: "rules", provider: info.name, text: fallback, note: "The AI provider was unavailable; this is a rule-based summary of the same statistics." });
  }
}
