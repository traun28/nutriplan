/**
 * Part 15 — Dataset Management workspace.
 *
 * Upload → validate → process → preview → import → analyse.
 * Datasets are REFERENCE data and stay separate from the live user profile:
 * uploading a dataset never changes the user's own details.
 */
"use client";

import { Database, FileText, Loader2 } from "lucide-react";
import { useCallback } from "react";
import { useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { DatasetUploader, type DatasetUploadResult } from "@/components/dataset/DatasetUploader";
import { ImportReview } from "@/components/dataset/ImportReview";
import { DatasetAnalyzer } from "@/components/dataset/analyzer/DatasetAnalyzer";
import { Toast, useToast } from "@/components/ui/Toast";
import {
  DatasetLibrary,
  type DatasetRow,
} from "@/components/dataset/DatasetLibrary";
import { AsyncError } from "@/hooks/AsyncError";
import { useAsyncData } from "@/hooks/useAsyncData";
import { apiClient } from "@/services/apiClient";
import { Button, Card, CardBody, SectionHeader } from "@/components/ui/core";
import { ManualStudentEntry } from "@/components/dataset/ManualStudentEntry";

export default function DatasetsPage() {
  return (
    <RequireAuth>
      <DatasetsWorkspace />
    </RequireAuth>
  );
}

function DatasetsWorkspace() {
  const [analysisId, setAnalysisId] = useState<number | null>(null);
  const [staged, setStaged] = useState<DatasetUploadResult | null>(null);
  const { toast, show: showToast, dismiss: dismissToast } = useToast();
  const load = useCallback(async () => {
    const data = await apiClient.get<{ datasets: DatasetRow[] }>("/api/datasets");
    return data.datasets;
  }, []);

  const { state, reload, reloading } = useAsyncData<DatasetRow[]>(load);

  const remove = useCallback(async (id: number): Promise<boolean> => {
    try {
      await apiClient.delete(`/api/datasets/${id}`);
      // Refresh from the server: the row disappears because the delete
      // really succeeded.
      await reload();
      return true;
    } catch {
      return false;
    }
  }, [reload]);

  const totalRecords = state.data?.reduce((sum, d) => sum + d.recordCount, 0) ?? 0;
  const needsReview =
    state.data?.filter((d) => d.status === "needs_review").length ?? 0;

  return (
    <div className="page-container page-section max-w-4xl">
      <header className="mb-8">
        <SectionHeader
          eyebrow="Reference data"
          title="Dataset Management"
          description="Upload, review, validate and analyse nutrition datasets. Datasets are kept as reference data — they never overwrite your own profile."
        />
      </header>

      <Card className="mb-6 overflow-hidden">
        <CardBody>
          <p className="text-xs font-bold uppercase tracking-wide text-brand-400">
            From data to diet chart
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            {[
              ["01", "Upload", "Select a CSV, XLSX, DOCX or PDF file"],
              ["02", "Validate", "Check columns, types, duplicates and gaps"],
              ["03", "Import", "Confirm the preview; invalid rows are rejected"],
              ["04", "Analyze", "Search, filter, review, chart and export"],
            ].map(([number, title, description]) => (
              <div key={number} className="relative rounded-[10px] border border-line bg-canvas p-3">
                <span className="text-xs font-bold text-brand-400">{number}</span>
                <p className="mt-2 text-sm font-bold text-ink">{title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted">
            Nothing is imported until you confirm the validation report. Select{" "}
            <strong>Analyze dataset</strong> on an imported dataset to review every student
            without changing your personal planner.
          </p>
        </CardBody>
      </Card>

      <Card className="mb-6">
        <CardBody>
          <h2 className="text-base font-bold text-ink">Upload dataset</h2>
          <p className="mt-1 text-sm text-muted">
            Import nutrition or diet datasets for analysis and reference.
          </p>
          <div className="mt-5">
            <DatasetUploader
              onUploaded={(result) => {
                setStaged(result);
                void reload();
              }}
            />
          </div>
        </CardBody>
      </Card>

      {staged && (
        <div className="mb-6">
          <ImportReview
            key={staged.dataset.id}
            datasetId={staged.dataset.id}
            fileName={staged.dataset.fileName}
            initialReport={staged.report}
            fileWarnings={staged.warnings}
            onImported={({ imported, rejected }) => {
              const id = staged.dataset.id;
              setStaged(null);
              showToast(`Imported ${imported.toLocaleString()} record${imported === 1 ? "" : "s"}${rejected > 0 ? `; ${rejected} rejected` : ""}.`);
              void reload();
              setAnalysisId(id);
            }}
            onCancelled={() => {
              setStaged(null);
              showToast("Upload cancelled — nothing was imported.");
              void reload();
            }}
          />
        </div>
      )}

      <ManualStudentEntry onSaved={() => void reload()} />
      <Card className="mb-6 border-brand-400/25 bg-brand-50/40">
        <CardBody className="flex flex-wrap items-center justify-between gap-4">
          <div><p className="text-sm font-bold text-ink">Need BMI and symptom screening?</p><p className="mt-1 text-xs text-muted">Open the separate Health Screening Analyzer for CSV import and screening reports.</p></div>
          <Button size="sm" href="/health-screening">Open Health Screening</Button>
        </CardBody>
      </Card>

      {state.status === "loading" && (
        <Card>
          <CardBody className="py-10">
            <div className="flex items-center gap-3 text-sm text-muted">
              <Loader2 className="h-5 w-5 animate-spin text-brand-400" aria-hidden="true" />
              Loading your datasets…
            </div>
            <div className="mt-5 space-y-2">
              <div className="h-16 animate-pulse rounded-[10px] bg-line/40" />
              <div className="h-16 animate-pulse rounded-[10px] bg-line/30" />
            </div>
          </CardBody>
        </Card>
      )}

      {state.status === "error" && (
        <AsyncError
          message={state.error.message}
          retryable={state.error.retryable}
          onRetry={() => void reload()}
        />
      )}

      {state.status === "ready" && (
        <>
          {state.data.length > 0 && (
            <div className="mb-5 grid gap-3 sm:grid-cols-3">
              <SummaryCard
                icon={<Database className="h-4 w-4 text-brand-400" aria-hidden="true" />}
                label="Datasets"
                value={String(state.data.length)}
              />
              <SummaryCard
                icon={<FileText className="h-4 w-4 text-brand-400" aria-hidden="true" />}
                label="Records"
                value={totalRecords.toLocaleString()}
              />
              <SummaryCard
                icon={<FileText className="h-4 w-4 text-accent-300" aria-hidden="true" />}
                label="Need review"
                value={String(needsReview)}
              />
            </div>
          )}

          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">
              Uploaded datasets
            </h2>
            <Button
              size="sm"
              variant="ghost"
              loading={reloading}
              disabled={reloading}
              onClick={() => void reload()}
            >
              Refresh
            </Button>
          </div>

          <DatasetLibrary
            datasets={state.data}
            onChanged={() => void reload()}
            onDelete={remove}
            onAnalyze={(id) => {
              setAnalysisId(id);
              setTimeout(() => document.getElementById("dataset-analyzer")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
            }}
            onResume={(row) => setStaged({ dataset: row, report: row.validation!, warnings: row.warnings })}
          />
          {analysisId !== null && (() => {
            const ds = state.data.find((d) => d.id === analysisId);
            if (!ds || ds.recordCount === 0) return null;
            return (
              <div className="mt-6">
                <DatasetAnalyzer
                  dataset={{ id: ds.id, displayName: ds.displayName, fileName: ds.fileName, recordCount: ds.recordCount, createdAt: ds.createdAt, columns: ds.columns }}
                  onClose={() => setAnalysisId(null)}
                />
              </div>
            );
          })()}
        </>
      )}

      <Toast toast={toast} onDismiss={dismissToast} />
      <Card className="mt-6">
        <CardBody className="text-xs leading-relaxed text-muted">
          <p className="font-semibold text-ink">Dataset &amp; profile separation</p>
          <p className="mt-1">
            Uploaded and manually entered student records belong only to this dataset
            workspace. They never change your name, age, weight, goals, allergies,
            preferences, personal nutrition, or diet plan.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardBody className="flex items-center gap-3 py-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-brand-50">
          {icon}
        </span>
        <div>
          <p className="text-xs text-muted">{label}</p>
          <p className="text-lg font-bold text-ink">{value}</p>
        </div>
      </CardBody>
    </Card>
  );
}

