"use client";

/**
 * Part 15 — Dataset upload workspace.
 *
 * Drag & drop (or browse) a dataset file — DOCX, PDF, CSV, XLSX, JSON, XML,
 * TXT — then process it. The file is uploaded to /api/datasets, which runs
 * the real ingestion pipeline server-side; the preview and quality report
 * shown afterwards come from that response, never from invented data.
 */
import { AlertTriangle, CheckCircle2, FileUp, Loader2, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { apiClient, toUserMessage } from "@/services/apiClient";
import { ATTACHMENT_LIMITS, formatBytes } from "@/services/attachments/config";
import { Button } from "@/components/ui/core";
import { cn } from "@/lib/cn";

const ACCEPTED =
  ".docx,.pdf,.csv,.tsv,.xlsx,.json,.xml,.txt,.html,.htm,.odt,.pptx,.rtf";

export interface DatasetUploadResult {
  dataset: {
    id: number;
    fileName: string;
    kind: string;
    status: string;
    recordCount: number;
    columns: string[];
    previewRows: string[][];
    warnings: string[];
  };
  statusDetail: string;
}

interface Props {
  onUploaded: (result: DatasetUploadResult) => void;
}

export function DatasetUploader({ onUploaded }: Props) {
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = useCallback((file: File | undefined) => {
    if (!file) return;
    setError(null);
    setSuccess(null);
    if (file.size === 0) {
      setError(`"${file.name}" is empty.`);
      return;
    }
    if (file.size > ATTACHMENT_LIMITS.maxFileSizeBytes) {
      setError(
        `"${file.name}" is ${formatBytes(file.size)}, which exceeds the ${formatBytes(
          ATTACHMENT_LIMITS.maxFileSizeBytes,
        )} limit.`,
      );
      return;
    }
    setSelected(file);
  }, []);

  const process = useCallback(async () => {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    setProgress(10);

    try {
      const bytes = new Uint8Array(await selected.arrayBuffer());
      setProgress(45);
      const result = await apiClient.upload<DatasetUploadResult>(
        "/api/datasets",
        bytes,
        selected.name,
        selected.type,
      );
      setProgress(100);
      setSuccess(
        result.dataset.recordCount > 0
          ? `Processed ${result.dataset.recordCount} record(s) from ${selected.name}.`
          : `${selected.name} was uploaded, but no records were detected.`,
      );
      setSelected(null);
      onUploaded(result);
    } catch (err) {
      setError(toUserMessage(err, "The dataset could not be processed."));
    } finally {
      setBusy(false);
      setProgress(0);
    }
  }, [selected, busy, onUploaded]);

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload a dataset. Drag and drop or click to browse."
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          pick(event.dataTransfer.files?.[0]);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed px-6 py-10 text-center transition-all",
          dragging
            ? "border-brand-500 bg-brand-50"
            : "border-line bg-white hover:border-brand-300 hover:bg-canvas",
          busy && "pointer-events-none opacity-70",
        )}
      >
        <span
          className={cn(
            "grid h-12 w-12 place-items-center rounded-full",
            dragging ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-600",
          )}
        >
          {busy ? (
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
          ) : (
            <FileUp className="h-6 w-6" aria-hidden="true" />
          )}
        </span>

        <div>
          <p className="text-sm font-semibold text-ink">
            {dragging
              ? "Drop your dataset here"
              : busy
                ? "Processing your dataset…"
                : "Drag & drop your dataset here, or click to browse"}
          </p>
          <p className="mt-1 text-xs text-muted">
            DOCX · PDF · CSV · XLSX · JSON · XML · TXT — up to{" "}
            {formatBytes(ATTACHMENT_LIMITS.maxFileSizeBytes)}
          </p>
        </div>

        {busy && (
          <div className="w-full max-w-xs" aria-live="polite">
            <div className="h-1.5 w-full overflow-hidden rounded-pill bg-line">
              <div
                className="h-full rounded-pill bg-brand-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={(event) => {
            pick(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>

      {selected && !busy && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-line bg-canvas px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{selected.name}</p>
            <p className="text-xs text-muted">{formatBytes(selected.size)}</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void process()}>
              Process dataset
            </Button>
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label={`Remove ${selected.name}`}
              className="grid h-8 w-8 place-items-center rounded-[10px] text-muted transition-colors hover:bg-danger-50 hover:text-danger-600"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-[10px] bg-danger-50 px-3.5 py-2.5 text-xs text-danger-700"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
      {success && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-[10px] bg-brand-50 px-3.5 py-2.5 text-xs text-brand-700"
        >
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {success}
        </p>
      )}
    </div>
  );
}
