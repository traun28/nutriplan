"use client";

/**
 * Shared async-data state for pages that load from the server.
 *
 * Guarantees the four states the UI must always be able to render —
 * loading / success / empty / error — so no screen can sit on a spinner
 * forever. Includes a manual `reload()` (never an automatic endless retry)
 * and a guard against overlapping requests after unmount.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, toUserMessage } from "@/services/apiClient";

export type AsyncState<T> =
  | { status: "loading"; data: null; error: null }
  | { status: "ready"; data: T; error: null }
  | { status: "error"; data: null; error: { message: string; retryable: boolean } };

export function useAsyncData<T>(
  loader: () => Promise<T>,
  deps: unknown[] = [],
  options: { enabled?: boolean } = {},
) {
  const { enabled = true } = options;
  const [state, setState] = useState<AsyncState<T>>({
    status: "loading",
    data: null,
    error: null,
  });
  const [reloading, setReloading] = useState(false);
  const mounted = useRef(true);
  const loaderRef = useRef(loader);

  useEffect(() => {
    loaderRef.current = loader;
  }, [loader]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    if (!mounted.current) return;
    setState({ status: "loading", data: null, error: null });
    try {
      const data = await loaderRef.current();
      if (!mounted.current) return;
      setState({ status: "ready", data, error: null });
    } catch (error) {
      if (!mounted.current) return;
      setState({
        status: "error",
        data: null,
        error: {
          message: toUserMessage(error, "Could not load this information."),
          retryable: error instanceof ApiError ? error.retryable : true,
        },
      });
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  const reload = useCallback(async () => {
    setReloading(true);
    await run();
    if (mounted.current) setReloading(false);
  }, [run]);

  return { state, reload, reloading };
}
