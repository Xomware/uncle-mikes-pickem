"use client";

import { useEffect, useRef, useState } from "react";

export type Load<T> = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: T };

/** Runs `fetcher` on mount and on retry. Memoize `fetcher`, or it refetches every render. */
export function useLoad<T>(fetcher: () => Promise<T>) {
  const [load, setLoad] = useState<Load<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const current = useRef(fetcher);

  useEffect(() => {
    current.current = fetcher;
    let cancelled = false;
    fetcher().then(
      (data) => !cancelled && setLoad({ status: "ready", data }),
      (err: unknown) =>
        !cancelled && setLoad({ status: "error", message: err instanceof Error ? err.message : "Something went wrong." }),
    );
    return () => {
      cancelled = true;
    };
  }, [fetcher, attempt]);

  function retry() {
    setLoad({ status: "loading" });
    setAttempt((n) => n + 1);
  }

  /** Refetch in place for polling. A failed poll keeps the last data on screen; the next one retries. */
  function refresh(): Promise<void> {
    return fetcher().then(
      // Dropped when the page has moved on to another fetcher (a different week) meanwhile.
      (data) => {
        if (current.current === fetcher) setLoad({ status: "ready", data });
      },
      () => undefined,
    );
  }

  return { load, retry, refresh, setData: (data: T) => setLoad({ status: "ready", data }) };
}
