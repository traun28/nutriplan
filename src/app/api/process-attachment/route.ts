/**
 * Part 12 — server-side attachment processing.
 *
 * Format processors (PDF via pdf.js, Office via jszip) run here in Node,
 * where they are reliable. The client uploads bytes and receives back a
 * structured extraction result — the original file is never stored.
 *
 * Hard limits are enforced again here (defence in depth) even though the
 * client checks them first.
 */
import { NextRequest, NextResponse } from "next/server";
import { ATTACHMENT_LIMITS } from "@/services/attachments/config";
import { processFile } from "@/services/attachments/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const fileName =
      request.headers.get("x-file-name")?.slice(0, 200) ?? "attachment";
    const mimeType =
      request.headers.get("x-file-mime")?.slice(0, 100) ?? "application/octet-stream";

    const arrayBuffer = await request.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    if (bytes.length === 0) {
      return NextResponse.json(
        { error: "The file is empty." },
        { status: 400 },
      );
    }
    if (bytes.length > ATTACHMENT_LIMITS.maxFileSizeBytes) {
      return NextResponse.json(
        {
          error: `The file exceeds the ${Math.round(
            ATTACHMENT_LIMITS.maxFileSizeBytes / (1024 * 1024),
          )} MB per-file limit.`,
        },
        { status: 413 },
      );
    }

    const provenance = fileName;
    const outcome = await processFile(bytes, fileName, mimeType, provenance);

    // Strip any accidental binary from the response; keep only JSON-safe data.
    return NextResponse.json({
      kind: outcome.kind,
      status: outcome.status,
      statusDetail: outcome.statusDetail,
      processingMs: outcome.processingMs,
      signature: outcome.signature,
      extraction: outcome.extraction,
    });
  } catch (error) {
    // A parser crash must never reach the user as a stack trace.
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred.";
    return NextResponse.json(
      {
        error: `The file could not be processed (${message}). It may be corrupt, password protected, or in an unsupported format.`,
      },
      { status: 422 },
    );
  }
}
