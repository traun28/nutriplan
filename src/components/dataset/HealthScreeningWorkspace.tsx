"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, FileUp, Search, ShieldCheck, X } from "lucide-react";
import { apiClient, toUserMessage } from "@/services/apiClient";
import { Badge, Button, Card, CardBody } from "@/components/ui/core";
import { analyzeScreeningCsv, parseCsv, type HealthScreeningRecord, type ScreeningAnalysis } from "@/services/dataset/healthScreening";

const ACCEPTED_FILES = ".csv,.tsv,.pdf,.doc,.docx,.xls,.xlsx,.json,.xml,.txt,.html,.htm,.odt,.pptx,.rtf";

function symptom(value: boolean | null) { return value === null ? "Unknown / not provided" : value ? "Yes" : "No"; }
function tone(record: HealthScreeningRecord) { return record.status === "clean" ? "border-brand-400/25 bg-brand-50 text-brand-400" : "border-accent-300 bg-accent-100 text-accent-700"; }

export function HealthScreeningWorkspace() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ rows: string[][]; columns: string[] } | null>(null);
  const [analysis, setAnalysis] = useState<ScreeningAnalysis | null>(null);
  const [selected, setSelected] = useState<HealthScreeningRecord | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selected) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setSelected(null); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [selected]);

  const choose = async (picked: File | undefined) => {
    if (!picked) return;
    setError(null);
    if (picked.size > 10 * 1024 * 1024) { setError("The file must be smaller than 10 MB."); return; }
    if (/\.(csv|tsv)$/i.test(picked.name)) {
      const rows = parseCsv(await picked.text());
      if (rows.length < 2) { setError("The CSV needs a header row and at least one student row."); return; }
      setPreview({ columns: rows[0], rows: rows.slice(1, 6) });
    } else {
      setPreview({ columns: ["Document preview"], rows: [[picked.name]] });
    }
    setFile(picked);
  };

  const importFile = async () => {
    if (!file || busy) return;
    setBusy(true); setError(null);
    try {
      const result = await apiClient.upload<{ analysis: ScreeningAnalysis }>(
        "/api/datasets/screening",
        new Uint8Array(await file.arrayBuffer()),
        file.name,
        file.type || "application/octet-stream",
      );
      setAnalysis(result.analysis);
      setSelected(null);
      setFile(null);
      setPreview(null);
    } catch (err) {
      setError(toUserMessage(err, "The screening file could not be imported. Please sign in and try again."));
    } finally { setBusy(false); }
  };

  const filtered = useMemo(() => (analysis?.records ?? []).filter((record) => {
    const needle = query.toLowerCase().trim();
    const textMatch = !needle || record.name.toLowerCase().includes(needle) || record.participantId.toLowerCase().includes(needle);
    const filterMatch = filter === "all" || record.bmiCategory === filter || record.indicators.some((indicator) => indicator.toLowerCase() === filter);
    return textMatch && filterMatch;
  }), [analysis, filter, query]);

  const openIndicator = (indicator: string) => {
    const record = analysis?.records.find((candidate) => candidate.indicators.includes(indicator));
    if (record) setSelected(record);
  };

  const exportCsv = () => {
    if (!analysis) return;
    const rows = [["Student_ID", "Name", "Age", "Height_cm", "Weight_kg", "BMI", "BMI_Category", "Possible_Indicators", "Suggestions"], ...analysis.records.map((record) => [record.participantId, record.name, String(record.age ?? ""), String(record.heightCm ?? ""), String(record.weightKg ?? ""), String(record.calculatedBmi ?? ""), record.bmiCategory ?? "", record.indicators.join("; "), record.suggestions.join(" ")])];
    const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); const link = document.createElement("a"); link.href = url; link.download = "health-screening-analysis.csv"; link.click(); URL.revokeObjectURL(url);
  };

  return <>
    <Card className="mb-6 border-brand-400/25"><CardBody className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-brand-400">Separate screening dataset</p><h2 className="mt-1 text-xl font-bold text-ink">Health Screening Import</h2><p className="mt-1 text-sm text-muted">Import CSV, PDF, DOCX, XLSX, JSON, XML, and other supported documents.</p></div><Button size="sm" icon={<FileUp className="h-4 w-4" aria-hidden="true" />} onClick={() => inputRef.current?.click()}>Import Student File</Button><input ref={inputRef} type="file" accept={ACCEPTED_FILES} className="hidden" onChange={(event) => { void choose(event.target.files?.[0]); event.target.value = ""; }} /></div>
      {preview && <div className="rounded-[10px] border border-line bg-canvas p-4"><p className="text-sm font-bold text-ink">Preview: {file?.name}</p><p className="mt-1 text-xs text-muted">Showing {preview.rows.length} rows · {preview.columns.length} detected columns</p><div className="mt-3 overflow-x-auto"><table className="min-w-[720px] border-collapse text-xs"><thead><tr>{preview.columns.map((column) => <th key={column} scope="col" className="border-b border-line px-2 py-2 text-left text-muted">{column}</th>)}</tr></thead><tbody>{preview.rows.map((row, index) => <tr key={index}>{preview.columns.map((_, cell) => <td key={cell} className="border-b border-line/60 px-2 py-2 text-ink">{row[cell] ?? ""}</td>)}</tr>)}</tbody></table></div><div className="mt-3 flex gap-2"><Button size="sm" loading={busy} onClick={() => void importFile()}>Import Dataset</Button><Button size="sm" variant="ghost" onClick={() => { setFile(null); setPreview(null); }}>Cancel</Button></div></div>}
      {error && <p role="alert" className="rounded-[10px] bg-danger-50 px-3 py-2 text-sm text-danger-700">{error}</p>}
      {analysis && <ScreeningResults analysis={analysis} filtered={filtered} query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} onSelect={setSelected} onIndicator={openIndicator} onExport={exportCsv} />}
    </CardBody></Card>
    {selected && <ScreeningDetails record={selected} onClose={() => setSelected(null)} />}
  </>;
}

function ScreeningResults({ analysis, filtered, query, setQuery, filter, setFilter, onSelect, onIndicator, onExport }: { analysis: ScreeningAnalysis; filtered: HealthScreeningRecord[]; query: string; setQuery: (value: string) => void; filter: string; setFilter: (value: string) => void; onSelect: (record: HealthScreeningRecord) => void; onIndicator: (indicator: string) => void; onExport: () => void }) {
  return <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-4"><Metric label="Total students" value={analysis.total} /><Metric label="Valid" value={analysis.valid} /><Metric label="Needs review" value={analysis.needsReview} /><Metric label="Average BMI" value={analysis.averageBmi ?? "Not available"} /></div><div className="grid gap-2 sm:grid-cols-4">{Object.entries(analysis.bmiCounts).map(([label, count]) => <Metric key={label} label={label} value={count} />)}</div><div className="rounded-[10px] border border-brand-400/25 bg-brand-50/40 p-4"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-brand-400" aria-hidden="true" /><div><h3 className="text-sm font-bold text-ink">Possible nutrition-related indicators</h3><p className="mt-1 text-xs text-muted">Click one to open a full student report on this page.</p></div></div><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(analysis.indicatorCounts).map(([indicator, count]) => <button key={indicator} type="button" onClick={() => onIndicator(indicator)} className="flex items-center justify-between rounded-[10px] border border-brand-400/25 bg-surface px-3 py-2 text-left text-sm hover:border-brand-500"><span className="font-semibold text-ink">{indicator}</span><span className="rounded-pill bg-brand-50 px-2 py-1 text-xs font-bold text-brand-400">{count}</span></button>)}{Object.keys(analysis.indicatorCounts).length === 0 && <p className="text-sm text-muted">No possible indicators detected.</p>}</div></div><div className="rounded-[10px] border border-line bg-canvas p-4"><div className="flex flex-wrap gap-2"><div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search student" aria-label="Search students" className="h-10 w-full rounded-[10px] border border-line bg-surface pl-9 pr-3 text-sm" /></div><select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter screening results" className="h-10 rounded-[10px] border border-line bg-surface px-3 text-sm"><option value="all">All screening results</option>{Object.keys(analysis.bmiCounts).map((item) => <option key={item} value={item}>{item}</option>)}{Object.keys(analysis.indicatorCounts).map((item) => <option key={item} value={item}>{item}</option>)}</select><Button size="sm" variant="outline" onClick={onExport}>Export</Button></div><div className="mt-3 overflow-x-auto rounded-[10px] border border-line bg-surface"><table className="w-full min-w-[760px] border-collapse text-xs"><thead className="bg-canvas text-left text-muted"><tr><th scope="col" className="px-3 py-2">ID</th><th scope="col" className="px-3 py-2">Name</th><th scope="col" className="px-3 py-2">Age</th><th scope="col" className="px-3 py-2">BMI</th><th scope="col" className="px-3 py-2">Category</th><th scope="col" className="px-3 py-2">Indicators</th><th scope="col" className="px-3 py-2">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>{filtered.map((record) => <tr key={`${record.participantId}-${record.source.row}`} className="border-t border-line/70"><td className="px-3 py-2 font-semibold text-ink">{record.participantId}</td><td className="px-3 py-2 font-semibold text-ink">{record.name}</td><td className="px-3 py-2 text-muted">{record.age ?? "Unknown"}</td><td className="px-3 py-2 text-muted">{record.calculatedBmi ?? "Unknown"}</td><td className="px-3 py-2 text-muted">{record.bmiCategory ?? "Unknown"}</td><td className="max-w-[240px] px-3 py-2 text-muted">{record.indicators.length ? record.indicators.join(", ") : "None detected"}</td><td className="px-3 py-2"><Badge className={tone(record)}>{record.status === "clean" ? "Clean" : "Needs review"}</Badge></td><td className="px-3 py-2"><button type="button" onClick={() => onSelect(record)} className="font-semibold text-brand-400 hover:underline">Details</button></td></tr>)}</tbody></table></div><p className="mt-2 text-xs text-muted">{filtered.length} student(s) shown. Details open in a popup and keep you on this page.</p></div></div>;
}

function ScreeningDetails({ record, onClose }: { record: HealthScreeningRecord; onClose: () => void }) {
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-canvas/70 px-4 py-6 backdrop-blur-sm" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}><section role="dialog" aria-modal="true" aria-labelledby="screening-details-title" className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-card border border-line bg-surface shadow-pop"><div className="sticky top-0 flex items-start justify-between gap-4 border-b border-line bg-surface px-5 py-4"><div><p className="text-xs font-bold uppercase tracking-wide text-brand-400">Full student screening report</p><h2 id="screening-details-title" className="mt-1 text-xl font-bold text-ink">{record.name} · {record.participantId}</h2><p className="mt-1 text-xs text-muted">Row {record.source.row} from {record.source.fileName}</p></div><button type="button" onClick={onClose} aria-label="Close student details" className="grid h-9 w-9 place-items-center rounded-[10px] text-muted hover:bg-canvas hover:text-ink"><X className="h-5 w-5" aria-hidden="true" /></button></div><div className="space-y-5 px-5 py-5"><div className="grid gap-3 sm:grid-cols-4"><Metric label="Age" value={record.age ?? "Unknown"} /><Metric label="Height" value={record.heightCm === null ? "Unknown" : `${record.heightCm} cm`} /><Metric label="Weight" value={record.weightKg === null ? "Unknown" : `${record.weightKg} kg`} /><Metric label="Calculated BMI" value={record.calculatedBmi ?? "Not available"} /></div><div className="rounded-[10px] border border-line bg-canvas p-4"><p className="text-sm font-bold text-ink">BMI category</p><p className="mt-1 text-sm text-muted">{record.bmiCategory ?? "Not assessable"} · screening classification only</p></div><div><h3 className="text-sm font-bold text-ink">Symptoms</h3><div className="mt-2 grid gap-2 sm:grid-cols-2">{Object.entries(record.symptoms).map(([label, value]) => <div key={label} className="flex justify-between rounded-[10px] border border-line bg-surface p-3 text-xs"><span className="font-semibold capitalize text-ink">{label.replace(/([A-Z])/g, " $1")}</span><span className="text-muted">{symptom(value)}</span></div>)}</div></div><div><h3 className="text-sm font-bold text-ink">Possible indicators, not confirmed deficiencies</h3><p className="mt-1 text-sm text-muted">{record.indicators.length ? record.indicators.join("; ") : "No major nutrition-related screening indicators detected."}</p></div><div><h3 className="text-sm font-bold text-ink">What may help with food and next steps</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted">{record.suggestions.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}</ul></div>{record.issues.length > 0 && <p className="rounded-[10px] bg-accent-100 px-3 py-2 text-xs text-accent-700">Data review: {record.issues.join(" ")}</p>}<p className="flex items-start gap-2 text-xs leading-relaxed text-muted"><AlertTriangle className="h-4 w-4 shrink-0 text-accent-300" aria-hidden="true" />These are screening indicators based on imported information. They do not confirm a medical or nutritional deficiency. Persistent symptoms should be discussed with a qualified healthcare professional.</p></div></section></div>;
}

function Metric({ label, value }: { label: string; value: string | number }) { return <div className="rounded-[10px] border border-line bg-surface p-3"><p className="text-xs text-muted">{label}</p><p className="mt-1 text-lg font-bold text-ink">{value}</p></div>; }
