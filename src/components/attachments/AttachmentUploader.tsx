/**
 * Part 12 — universal attachment uploader.
 *
 * Click-to-select, drag-and-drop, multi-file. Processing happens through
 * the AttachmentsContext (one file at a time) so large documents do not
 * freeze the UI.
 */
"use client";

import {
  FileUp,
  Loader2,
  Paperclip,
  X,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useAttachments } from "@/context/AttachmentsContext";
import { ATTACHMENT_LIMITS, formatBytes } from "@/services/attachments/config.ts";
import { cn } from "@/lib/cn";

const ACCEPTED =
  ".pdf,.docx,.doc,.txt,.rtf,.odt,.csv,.tsv,.xlsx,.xls,.xlsm,.json,.xml,.pptx,.ppt,.html,.htm,.jpg,.jpeg,.png,.webp,.gif,.bmp,.heic,.heif,.zip";

export function AttachmentUploader() {
  const { addFiles, processing, progress, attachments, acceptedBytes } = useAttachments();
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      void addFiles(files);
    },
    [addFiles],
  );

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(false);
      if (event.dataTransfer.files.length > 0) {
        handleFiles(event.dataTransfer.files);
      }
    },
    [handleFiles],
  );

  const remaining = ATTACHMENT_LIMITS.maxAttachments - attachments.length;
  const totalRemaining = ATTACHMENT_LIMITS.maxTotalBytes - acceptedBytes;

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload files. Click to browse or drag and drop."
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
        onDrop={onDrop}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed px-6 py-10 text-center transition-all",
          dragging
            ? "border-brand-500 bg-brand-50"
            : "border-line bg-surface hover:border-brand-400/50 hover:bg-canvas",
          processing && "pointer-events-none opacity-70",
        )}
      >
        <span
          className={cn(
            "grid h-12 w-12 place-items-center rounded-full",
            dragging ? "bg-brand-700 text-white" : "bg-brand-50 text-brand-400",
          )}
        >
          {processing ? (
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
          ) : (
            <FileUp className="h-6 w-6" aria-hidden="true" />
          )}
        </span>

        <div>
          <p className="text-sm font-semibold text-ink">
            {processing && progress
              ? `Processing ${progress.fileName || "file"}…`
              : "Drag and drop files here, or click to browse"}
          </p>
          <p className="mt-1 text-xs text-muted">
            PDF, DOCX, TXT, RTF, ODT, CSV, XLSX, JSON, XML, PPTX, HTML, JPG,
            PNG, WEBP — up to {formatBytes(ATTACHMENT_LIMITS.maxFileSizeBytes)} each
          </p>
        </div>

        {progress && processing && (
          <div className="w-full max-w-xs" aria-live="polite">
            <div className="flex justify-between text-xs text-muted">
              <span className="capitalize">{progress.stage}</span>
              <span>{progress.fileName}</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-pill bg-line">
              <div
                className="h-full rounded-pill bg-brand-500 transition-all duration-300"
                style={{
                  width:
                    progress.totalBytes > 0
                      ? `${Math.min(100, (progress.bytesRead / progress.totalBytes) * 100)}%`
                      : "15%",
                }}
              />
            </div>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED}
          className="hidden"
          onChange={(event) => {
            if (event.target.files) handleFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
          {attachments.length} of {ATTACHMENT_LIMITS.maxAttachments} attachments
          · {formatBytes(acceptedBytes)} used of{" "}
          {formatBytes(ATTACHMENT_LIMITS.maxTotalBytes)}
        </span>
        {remaining <= 2 && remaining > 0 && (
          <span>{remaining} slot(s) remaining</span>
        )}
        {remaining <= 0 && (
          <span className="font-semibold text-accent-300">Session full — remove an attachment to add more</span>
        )}
        {totalRemaining < ATTACHMENT_LIMITS.maxTotalBytes * 0.15 && (
          <span className="font-semibold text-accent-300">
            Approaching the {formatBytes(ATTACHMENT_LIMITS.maxTotalBytes)} session limit
          </span>
        )}
      </div>

      {attachments.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <X className="h-3 w-3" /> Remove an attachment by clicking its card.
        </p>
      )}
    </div>
  );
}
