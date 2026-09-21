"use client";

/**
 * Part 12 — attachment session state.
 *
 * Holds the current session's attachments and processes files through the
 * server API (/api/process-attachment). The original binary is never stored.
 *
 * Files are processed one at a time so a large document does not freeze
 * the UI, and a failure in one file never affects the others.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  AttachmentRecord,
  AttachmentStatus,
  ExtractionResult,
} from "../types/attachment.ts";
import { attachmentsStore } from "../services/attachments/storage.ts";
import { ATTACHMENT_LIMITS, categoryFor, hexSignature, sanitizeFileName } from "../services/attachments/config.ts";
import { checkLimits, hashBytes } from "../services/attachments/clientUtils.ts";
import { createId } from "../lib/id.ts";

export type AttachmentStage =
  | "idle"
  | "reading"
  | "uploading"
  | "processing"
  | "done";

interface AttachmentProgress {
  fileName: string;
  stage: AttachmentStage;
  bytesRead: number;
  totalBytes: number;
}

interface ServerOutcome {
  kind: AttachmentRecord["kind"];
  status: AttachmentStatus;
  statusDetail: string;
  processingMs: number | null;
  signature: string;
  extraction: ExtractionResult | null;
}

interface AttachmentsContextValue {
  attachments: AttachmentRecord[];
  failures: string[];
  progress: AttachmentProgress | null;
  processing: boolean;
  hasDuplicates: boolean;
  addFiles: (files: FileList | File[]) => Promise<void>;
  removeAttachment: (attachmentId: string) => void;
  clearAttachments: () => void;
  markAsReference: (attachmentId: string) => void;
  acceptedBytes: number;
}

const AttachmentsContext = createContext<AttachmentsContextValue | null>(null);

export function AttachmentsProvider({ children }: { children: ReactNode }) {
  const [attachments, setAttachments] = useState<AttachmentRecord[]>(() => {
    const loaded = attachmentsStore.load();
    return loaded.status === "ok" ? loaded.data : [];
  });
  const [failures, setFailures] = useState<string[]>([]);
  const [progress, setProgress] = useState<AttachmentProgress | null>(null);
  const [processing, setProcessing] = useState(false);

  const persist = useCallback((records: AttachmentRecord[]) => {
    attachmentsStore.save(records);
  }, []);

  const acceptedBytes = useMemo(
    () => attachments.reduce((sum, record) => sum + record.fileSizeBytes, 0),
    [attachments],
  );

  const hasDuplicates = useMemo(() => {
    const hashes = new Set<string>();
    for (const record of attachments) {
      if (hashes.has(record.contentHash)) return true;
      hashes.add(record.contentHash);
    }
    return false;
  }, [attachments]);

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0 || processing) return;

      let working = attachments;
      const newFailures: string[] = [];
      setProcessing(true);
      setProgress({ fileName: "", stage: "reading", bytesRead: 0, totalBytes: 0 });

      for (const file of list) {
        if (working.length >= ATTACHMENT_LIMITS.maxAttachments) {
          newFailures.push(
            `"${file.name}" was skipped — the session limit of ${ATTACHMENT_LIMITS.maxAttachments} attachments was reached.`,
          );
          continue;
        }

        setProgress({
          fileName: file.name,
          stage: "reading",
          bytesRead: 0,
          totalBytes: file.size,
        });

        let bytes: Uint8Array;
        try {
          bytes = new Uint8Array(await file.arrayBuffer());
        } catch {
          newFailures.push(`"${file.name}" could not be read.`);
          continue;
        }

        // Client-side limit + duplicate checks.
        const existingBytes = working.reduce(
          (sum, record) => sum + record.fileSizeBytes,
          0,
        );
        const limitCheck = checkLimits(bytes, file.name, working.length, existingBytes);
        if (!limitCheck.ok) {
          newFailures.push(limitCheck.reason);
          continue;
        }

        const contentHash = await hashBytes(bytes);
        const duplicate = working.find((r) => r.contentHash === contentHash);
        if (duplicate) {
          newFailures.push(
            `"${file.name}" is identical to "${duplicate.fileName}" (same content) — duplicate skipped.`,
          );
          continue;
        }

        setProgress({
          fileName: file.name,
          stage: "uploading",
          bytesRead: bytes.length,
          totalBytes: bytes.length,
        });

        // Server-side format processing.
        let outcome: ServerOutcome | null = null;
        try {
          const response = await fetch("/api/process-attachment", {
            method: "POST",
            headers: {
              "x-file-name": encodeURIComponent(file.name),
              "x-file-mime": file.type || "application/octet-stream",
            },
            body: bytes as unknown as BodyInit,
          });
          if (!response.ok) {
            const error = (await response.json().catch(() => null)) as
              | { error?: string }
              | null;
            throw new Error(error?.error ?? `Server returned ${response.status}`);
          }
          outcome = (await response.json()) as ServerOutcome;
        } catch (error) {
          const message = error instanceof Error ? error.message : "processing failed";
          newFailures.push(`"${file.name}" — ${message}`);
          continue;
        }

        setProgress({
          fileName: file.name,
          stage: "processing",
          bytesRead: bytes.length,
          totalBytes: bytes.length,
        });

        const extension = file.name.split(".").pop()?.toLowerCase() || "";
        const record: AttachmentRecord = {
          attachmentId: createId("att"),
          fileName: file.name,
          displayName: sanitizeFileName(file.name),
          extension,
          kind: outcome.kind,
          category: categoryFor(outcome.kind),
          mimeType: file.type || "application/octet-stream",
          detectedSignature: outcome.signature || hexSignature(bytes),
          fileSizeBytes: bytes.length,
          contentHash,
          uploadedAt: new Date().toISOString(),
          status: outcome.status,
          statusDetail: outcome.statusDetail,
          processingMs: outcome.processingMs,
          extraction: outcome.extraction,
          keptAsReference: false,
        };

        working = [...working, record];
        setAttachments(working);
      }

      persist(working);
      setFailures(newFailures);
      setProgress(null);
      setProcessing(false);
    },
    [attachments, processing, persist],
  );

  const removeAttachment = useCallback(
    (attachmentId: string) => {
      setAttachments((current) => {
        const next = current.filter((record) => record.attachmentId !== attachmentId);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const clearAttachments = useCallback(() => {
    setAttachments([]);
    attachmentsStore.clear();
  }, []);

  const markAsReference = useCallback(
    (attachmentId: string) => {
      setAttachments((current) => {
        const next = current.map((record) =>
          record.attachmentId === attachmentId
            ? {
                ...record,
                keptAsReference: true,
                status: "kept_as_reference" as AttachmentStatus,
              }
            : record,
        );
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const value = useMemo<AttachmentsContextValue>(
    () => ({
      attachments,
      failures,
      progress,
      processing,
      hasDuplicates,
      addFiles,
      removeAttachment,
      clearAttachments,
      markAsReference,
      acceptedBytes,
    }),
    [
      attachments,
      failures,
      progress,
      processing,
      hasDuplicates,
      addFiles,
      removeAttachment,
      clearAttachments,
      markAsReference,
      acceptedBytes,
    ],
  );

  return (
    <AttachmentsContext.Provider value={value}>{children}</AttachmentsContext.Provider>
  );
}

export function useAttachments(): AttachmentsContextValue {
  const context = useContext(AttachmentsContext);
  if (!context) {
    throw new Error("useAttachments must be used within an AttachmentsProvider");
  }
  return context;
}
