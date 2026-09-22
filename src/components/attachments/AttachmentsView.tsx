/**
 * Part 12 — universal attachment page.
 *
 * Upload → process → review → (optionally) import.
 * Attachments are supporting documents; they never silently overwrite the
 * live profile. The review screen is the only path to an import.
 */
"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, FileText, Trash2 } from "lucide-react";
import { useAttachments } from "@/context/AttachmentsContext";
import { AttachmentUploader } from "@/components/attachments/AttachmentUploader";
import { AttachmentCard } from "@/components/attachments/AttachmentCard";
import { ExtractionReview } from "@/components/attachments/ExtractionReview";
import { Button, Card, CardBody, EmptyState, SectionHeader } from "@/components/ui/core";
import type { AttachmentRecord } from "@/types/attachment.ts";

export function AttachmentsView() {
  const {
    attachments,
    failures,
    processing,
    removeAttachment,
    clearAttachments,
  } = useAttachments();
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const reviewing = useMemo(
    () => attachments.find((record) => record.attachmentId === reviewingId) ?? null,
    [attachments, reviewingId],
  );

  const sorted = useMemo(
    () =>
      [...attachments].sort((a, b) =>
        a.uploadedAt.localeCompare(b.uploadedAt) === 0
          ? a.fileName.localeCompare(b.fileName)
          : b.uploadedAt.localeCompare(a.uploadedAt),
      ),
    [attachments],
  );

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="mb-8">
        <SectionHeader
          eyebrow="Supporting documents"
          title="Documents & Attachments"
          description="Upload diet plans, food diaries, nutrition labels or spreadsheets. The application reads them, extracts structured information, and shows it to you for review — nothing touches your profile until you confirm."
        />
      </header>

      {/* Review mode replaces the list */}
      {reviewing ? (
        <ExtractionReview record={reviewing} onBack={() => setReviewingId(null)} />
      ) : (
        <div className="space-y-6">
          <AttachmentUploader />

          {failures.length > 0 && (
            <Card className="border-danger-500/30 bg-danger-50/50">
              <CardBody>
                <h2 className="flex items-center gap-2 text-sm font-bold text-danger-700">
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  Some files were not processed
                </h2>
                <ul className="mt-2 space-y-1">
                  {failures.map((failure) => (
                    <li key={failure} className="text-xs leading-relaxed text-danger-700">
                      · {failure}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          {sorted.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-6 w-6" aria-hidden="true" />}
              title="No attachments yet"
              description="Your uploaded documents will appear here. Each one is processed independently, so a problem with one file never affects the others."
            />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-wide text-muted">
                  Your attachments ({sorted.length})
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAttachments}
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                >
                  Clear all
                </Button>
              </div>
              {sorted.map((record) => (
                <AttachmentCard
                  key={record.attachmentId}
                  record={record}
                  onReview={(r: AttachmentRecord) => setReviewingId(r.attachmentId)}
                  onRemove={removeAttachment}
                />
              ))}
            </div>
          )}

          <Card>
            <CardBody className="space-y-2 text-xs leading-relaxed text-muted">
              <p className="font-semibold text-ink">Privacy & safety</p>
              <p>
                Documents are processed locally in your browser. The original
                files are never uploaded to a server, and only the extracted
                text and metadata are kept on this device. Macros, scripts and
                embedded objects are never executed. Password-protected or
                scanned documents are detected and explained rather than
                guessed.
              </p>
              <p>
                Extracted values are always shown for your review before they
                are applied to your profile. Your allergies, intolerances and
                foods-to-avoid are never overwritten — they are only added to.
              </p>
            </CardBody>
          </Card>

          <p className="text-center text-xs text-muted" aria-live="polite">
            {processing
              ? "Processing your documents…"
              : "Supported: PDF, DOCX, TXT, RTF, ODT, CSV, XLSX, JSON, XML, PPTX, HTML, JPG, PNG, WEBP"}
          </p>
        </div>
      )}
    </div>
  );
}
