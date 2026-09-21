/**
 * Part 12 — attachment persistence.
 *
 * Keeps attachment METADATA and EXTRACTED TEXT in localStorage (separate
 * key, separate from the profile and the generated plan). The original
 * binary files are NOT stored — the user keeps them on their device. This
 * is intentional and matches the local-only architecture of the app.
 */
import type { AttachmentRecord } from "../../types/attachment.ts";
import { isStorageAvailable, type ReadResult, type WriteResult } from "../profileStorage.ts";
import { ATTACHMENT_LIMITS } from "./config.ts";

export const ATTACHMENTS_STORAGE_KEY = "PERSONALISED_DIET_PLANNER_ATTACHMENTS";

function readAttachments(): ReadResult<AttachmentRecord[]> {
  if (!isStorageAvailable()) {
    return { status: "unavailable", message: "Browser storage is not available." };
  }
  try {
    const raw = window.localStorage.getItem(ATTACHMENTS_STORAGE_KEY);
    if (!raw) return { status: "empty" };
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return { status: "corrupt", message: "Attachments could not be read." };
    }
    return { status: "ok", data: parsed as AttachmentRecord[] };
  } catch {
    return { status: "corrupt", message: "Attachments could not be parsed." };
  }
}

function writeAttachments(records: AttachmentRecord[]): WriteResult {
  if (!isStorageAvailable()) {
    return { ok: false, message: "Browser storage is not available." };
  }
  try {
    window.localStorage.setItem(
      ATTACHMENTS_STORAGE_KEY,
      JSON.stringify(records.slice(0, ATTACHMENT_LIMITS.maxAttachments)),
    );
    return { ok: true };
  } catch {
    return {
      ok: false,
      message: "Your attachment list could not be saved (storage may be full).",
    };
  }
}

export interface AttachmentsStore {
  load: () => ReadResult<AttachmentRecord[]>;
  save: (records: AttachmentRecord[]) => WriteResult;
  remove: (attachmentId: string) => WriteResult;
  clear: () => WriteResult;
}

export const attachmentsStore: AttachmentsStore = {
  load: readAttachments,
  save: writeAttachments,
  remove(attachmentId) {
    const current = readAttachments();
    if (current.status !== "ok") return writeAttachments([]);
    return writeAttachments(
      current.data.filter((record) => record.attachmentId !== attachmentId),
    );
  },
  clear() {
    return writeAttachments([]);
  },
};
