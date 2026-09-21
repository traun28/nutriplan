/**
 * Part 15 — shared API client.
 *
 * Every request in the application goes through here, so:
 *   • there is exactly one place that knows the API base URL
 *     (always a RELATIVE path — works on localhost, on a deployed domain and
 *     on a preview URL without any configuration)
 *   • errors are normalised into a friendly, user-facing message
 *   • timeouts and aborts are handled, so a slow backend surfaces as an
 *     error with a Retry option rather than an endless loading state
 *   • credentials are sent so the session cookie works in production
 */

export type ApiErrorKind =
  | "network"
  | "timeout"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "too_large"
  | "unprocessable"
  | "server"
  | "unknown";

export class ApiError extends Error {
  kind: ApiErrorKind;
  status: number | null;
  /** True when retrying could plausibly succeed. */
  retryable: boolean;

  constructor(
    kind: ApiErrorKind,
    message: string,
    status: number | null = null,
    retryable = false,
  ) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.retryable = retryable;
  }
}

const DEFAULT_TIMEOUT_MS = 30000;

function friendlyMessage(status: number, serverMessage?: string): string {
  if (serverMessage && serverMessage.length > 0 && serverMessage.length < 300) {
    return serverMessage;
  }
  switch (status) {
    case 400:
      return "That request was not valid. Please check your input and try again.";
    case 401:
      return "Your session has expired. Please sign in again.";
    case 403:
      return "You don't have permission to do that.";
    case 404:
      return "That information could not be found.";
    case 409:
      return "That conflicts with information already saved.";
    case 413:
      return "That file is too large to upload.";
    case 422:
      return "The file could not be processed. It may be corrupt or unsupported.";
    default:
      return "The server could not complete that request. Please try again.";
  }
}

function classify(status: number): ApiErrorKind {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 413) return "too_large";
  if (status === 422) return "unprocessable";
  return "server";
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Raw binary upload (used for file processing). */
  rawBody?: Uint8Array;
  headers?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, rawBody, headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS, signal } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener("abort", onExternalAbort);

  try {
    const init: RequestInit = {
      method,
      // Same-origin session cookie; works on any host without CORS config.
      credentials: "same-origin",
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      signal: controller.signal,
    };

    if (rawBody !== undefined) {
      init.body = rawBody as unknown as BodyInit;
    } else if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    const response = await fetch(path, init);

    if (!response.ok) {
      let serverMessage: string | undefined;
      try {
        const parsed = (await response.json()) as { error?: string };
        serverMessage = parsed?.error;
      } catch {
        // non-JSON error body — fall back to the status-based message
      }
      const status = response.status;
      throw new ApiError(
        classify(status),
        friendlyMessage(status, serverMessage),
        status,
        status >= 500 || status === 408 || status === 429,
      );
    }

    if (response.status === 204) return undefined as T;

    const text = await response.text();
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError("server", "The server returned an unexpected response.");
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;

    const isAbort =
      (error instanceof DOMException && error.name === "AbortError") ||
      (error instanceof Error && error.name === "AbortError");

    if (isAbort) {
      if (signal?.aborted) {
        throw new ApiError("unknown", "The request was cancelled.", null, false);
      }
      throw new ApiError(
        "timeout",
        "The server took too long to respond. Please try again.",
        null,
        true,
      );
    }

    throw new ApiError(
      "network",
      "Could not reach the server. Check your connection and try again.",
      null,
      true,
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onExternalAbort);
  }
}

export const apiClient = {
  get: <T>(path: string, opts?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...opts, method: "GET" }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method">) =>
    request<T>(path, { ...opts, method: "POST", body }),
  put: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method">) =>
    request<T>(path, { ...opts, method: "PUT", body }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method">) =>
    request<T>(path, { ...opts, method: "PATCH", body }),
  delete: <T>(path: string, opts?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...opts, method: "DELETE" }),
  /** Binary upload: sends the raw bytes with file metadata in headers. */
  upload: <T>(
    path: string,
    bytes: Uint8Array,
    fileName: string,
    mimeType: string,
    opts?: Omit<RequestOptions, "method" | "body" | "rawBody">,
  ) =>
    request<T>(path, {
      ...opts,
      method: "POST",
      rawBody: bytes,
      headers: {
        "x-file-name": encodeURIComponent(fileName),
        "x-file-mime": mimeType || "application/octet-stream",
        ...(opts?.headers ?? {}),
      },
    }),
};

/** Maps any thrown value to a safe user-facing message. */
export function toUserMessage(error: unknown, fallback = "Something went wrong."): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
