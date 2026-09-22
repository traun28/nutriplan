/**
 * Phase 7 — printable dataset report (server-rendered, self-contained HTML).
 * No scripts, no external assets; every value is HTML-escaped. The browser's
 * Print → Save as PDF produces the PDF; charts are inline SVG with a data
 * table beside each so the report is readable without colour.
 */
import type { Aggregates, Distributions, Bucket, NumericSummary } from "@/services/server/datasetRecordRepository";

export interface ReportInput {
  datasetName: string;
  fileName: string;
  uploadedAt: string;
  generatedAt: string;
  totalRecords: number;
  filters: string[];
  aggregates: Aggregates;
  distributions: Distributions;
}

function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

const MIN_FOR_AVERAGES = 5;

function summaryRow(label: string, unit: string, s: NumericSummary): string {
  if (s.count < MIN_FOR_AVERAGES) {
    return `<tr><th scope="row">${esc(label)}</th><td>${s.count}</td><td colspan="3" class="muted">Not enough valid values (minimum ${MIN_FOR_AVERAGES})</td></tr>`;
  }
  return `<tr><th scope="row">${esc(label)}</th><td>${s.count}</td><td>${esc(s.mean)} ${esc(unit)}</td><td>${esc(s.min)} ${esc(unit)}</td><td>${esc(s.max)} ${esc(unit)}</td></tr>`;
}

function chart(title: string, buckets: Bucket[]): string {
  const total = buckets.reduce((a, b) => a + b.count, 0);
  if (total === 0) return `<section class="chart"><h3>${esc(title)}</h3><p class="muted">No valid values to chart.</p></section>`;
  const max = Math.max(...buckets.map((b) => b.count), 1);
  const w = 100 / buckets.length;
  const bars = buckets.map((b, i) => {
    const h = (b.count / max) * 80;
    return `<rect x="${(i * w + 1).toFixed(2)}" y="${(90 - h).toFixed(2)}" width="${(w - 2).toFixed(2)}" height="${h.toFixed(2)}" fill="#2f6b4f"/><text x="${(i * w + w / 2).toFixed(2)}" y="${(88 - h).toFixed(2)}" font-size="4" text-anchor="middle" fill="#1f2a24">${b.count}</text>`;
  }).join("");
  const rows = buckets.map((b) => `<tr><th scope="row">${esc(b.label)}</th><td>${b.count}</td><td>${total ? Math.round((b.count / total) * 100) : 0}%</td></tr>`).join("");
  return `<section class="chart"><h3>${esc(title)}</h3><div class="chart-grid"><svg viewBox="0 0 100 92" role="img" aria-label="${esc(title)} distribution">${bars}</svg><table><thead><tr><th scope="col">Range</th><th scope="col">Records</th><th scope="col">Share</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

export function renderReportHtml(input: ReportInput): string {
  const a = input.aggregates;
  const scope = input.filters.length > 0 ? `Selected records (${input.filters.length} filter${input.filters.length === 1 ? "" : "s"} applied)` : "All records";
  const statusRows = (Object.entries(a.recordStatus) as Array<[string, number]>).map(([k, v]) => `<tr><th scope="row">${esc(k.replace("_", " "))}</th><td>${v}</td><td>${a.total ? Math.round((v / a.total) * 100) : 0}%</td></tr>`).join("");
  const nutritionRows = (Object.entries(a.nutritionStatus) as Array<[string, number]>).map(([k, v]) => `<tr><th scope="row">${esc(k.replace(/_/g, " "))}</th><td>${v}</td><td>${a.total ? Math.round((v / a.total) * 100) : 0}%</td></tr>`).join("");
  const genderRows = a.gender.map((g) => `<tr><th scope="row">${esc(g.label)}</th><td>${g.count}</td></tr>`).join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(input.datasetName)} — dataset report</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1f2a24;margin:0;padding:32px;max-width:960px;margin-inline:auto;line-height:1.45}
  h1{font-size:24px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 8px;border-bottom:1px solid #d9e2dc;padding-bottom:4px}h3{font-size:14px;margin:16px 0 6px}
  .muted{color:#5f6d66}.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px 24px;font-size:13px;margin-top:12px}
  table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:left;padding:5px 8px;border-bottom:1px solid #e6ece8}th[scope=row]{font-weight:600}thead th{background:#f3f7f4}
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-top:8px}.card{border:1px solid #d9e2dc;border-radius:10px;padding:10px 12px}.card b{display:block;font-size:20px}.card span{font-size:12px;color:#5f6d66}
  .chart{break-inside:avoid;margin-top:8px}.chart-grid{display:grid;grid-template-columns:1.2fr 1fr;gap:16px;align-items:start}svg{width:100%;height:auto;border:1px solid #e6ece8;border-radius:8px;background:#fbfdfc}
  .note{font-size:12px;color:#5f6d66;border-left:3px solid #2f6b4f;padding-left:10px;margin-top:20px}
  @media print{body{padding:0}.chart{page-break-inside:avoid}}
</style></head><body>
<header>
  <p class="muted" style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.08em">NutriPlan · Student Dataset Report</p>
  <h1>${esc(input.datasetName)}</h1>
  <div class="meta">
    <div><span class="muted">Source file</span><br>${esc(input.fileName)}</div>
    <div><span class="muted">Uploaded</span><br>${esc(fmtDate(input.uploadedAt))}</div>
    <div><span class="muted">Report generated</span><br>${esc(fmtDate(input.generatedAt))}</div>
    <div><span class="muted">Records in dataset</span><br>${input.totalRecords}</div>
    <div><span class="muted">Scope</span><br>${esc(scope)}</div>
  </div>
  ${input.filters.length > 0 ? `<p style="font-size:13px"><strong>Active filters:</strong> ${input.filters.map(esc).join(" · ")}</p>` : ""}
</header>

<h2>Summary</h2>
<div class="cards">
  <div class="card"><b>${a.total}</b><span>Records in scope</span></div>
  <div class="card"><b>${a.recordStatus.complete}</b><span>Complete</span></div>
  <div class="card"><b>${a.recordStatus.incomplete}</b><span>Incomplete</span></div>
  <div class="card"><b>${a.recordStatus.needs_review}</b><span>Needs review</span></div>
  <div class="card"><b>${a.potentialOutliers}</b><span>Potential outliers</span></div>
  <div class="card"><b>${a.reviewed}</b><span>Marked reviewed</span></div>
  <div class="card"><b>${a.excluded}</b><span>Excluded (dataset-wide)</span></div>
</div>

<h2>Data quality</h2>
<table><caption class="muted" style="text-align:left;font-size:12px">Record status (derived from the recorded data)</caption><thead><tr><th scope="col">Status</th><th scope="col">Records</th><th scope="col">Share</th></tr></thead><tbody>${statusRows}</tbody></table>

<h2>Statistics</h2>
<table><thead><tr><th scope="col">Measure</th><th scope="col">Valid values</th><th scope="col">Average</th><th scope="col">Minimum</th><th scope="col">Maximum</th></tr></thead><tbody>
${summaryRow("Age", "years", a.age)}${summaryRow("Height", "cm", a.heightCm)}${summaryRow("Weight", "kg", a.weightKg)}${summaryRow("BMI", "", a.bmi)}${summaryRow("Calories", "kcal", a.calories)}${summaryRow("Protein", "g", a.protein)}
</tbody></table>
<p class="muted" style="font-size:12px">BMI = weight (kg) ÷ height (m)². Averages are shown only when at least ${MIN_FOR_AVERAGES} valid values exist. BMI categories are general screening ranges, not a diagnosis.</p>

<h2>Nutrition status (calories vs calculated reference)</h2>
<table><thead><tr><th scope="col">Status</th><th scope="col">Records</th><th scope="col">Share</th></tr></thead><tbody>${nutritionRows}</tbody></table>
<p class="muted" style="font-size:12px">"Potential gap based on recorded data" — the reference is calculated from each record's age, height, weight and activity with the same energy model used for personal plans.</p>

${genderRows ? `<h2>Gender</h2><table><thead><tr><th scope="col">Recorded value</th><th scope="col">Records</th></tr></thead><tbody>${genderRows}</tbody></table>` : ""}

<h2>Distributions</h2>
${chart("Age", input.distributions.age)}
${chart("Weight (kg)", input.distributions.weightKg)}
${chart("Height (cm)", input.distributions.heightCm)}
${chart("BMI", input.distributions.bmi)}
${chart("Calories (kcal)", input.distributions.calories)}
${chart("Protein (g)", input.distributions.protein)}

<p class="note">This report describes the uploaded dataset only. It does not include personal profile data, does not rank individuals and does not provide medical advice. Values flagged as potential outliers or needing review were kept as recorded so they can be checked against the source.</p>
</body></html>`;
}
