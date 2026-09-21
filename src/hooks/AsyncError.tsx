"use client";

/** Small helper: renders a consistent error card for any async failure. */
export function AsyncError({
  message,
  onRetry,
  retryable = true,
}: {
  message: string;
  onRetry?: () => void;
  retryable?: boolean;
}) {
  return (
    <div
      role="alert"
      className="rounded-card border border-danger-100 bg-danger-50/60 p-5"
    >
      <p className="text-sm font-semibold text-danger-700">
        Unable to load this information
      </p>
      <p className="mt-1 text-sm text-danger-700/90">{message}</p>
      {retryable && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 inline-flex items-center gap-1.5 rounded-pill border border-danger-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-danger-700 transition-colors hover:bg-danger-50"
        >
          Retry
        </button>
      )}
    </div>
  );
}
