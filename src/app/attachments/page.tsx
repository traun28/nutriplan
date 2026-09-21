import type { Metadata } from "next";
import { AttachmentsView } from "@/components/attachments/AttachmentsView";

export const metadata: Metadata = {
  title: "Documents & Attachments",
  description:
    "Attach diet plans, food diaries, nutrition labels and spreadsheets. Extracted information is reviewed before it touches your profile.",
};

/**
 * Part 12 — Documents & Attachments route.
 * Server shell for metadata; the interactive view is a client component.
 */
export default function AttachmentsPage() {
  return <AttachmentsView />;
}
