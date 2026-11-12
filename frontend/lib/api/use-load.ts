"use client";

import { useEffect, useState } from "react";

export type Load<T> = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: T };

/** Runs `fetcher` on mount and on retry. Memoize `fetcher`, or it refetches every render. */
export function useLoad<T>(fetcher: () => Promise<T>) {
  const [load, setLoad] = useState<Load<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
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

  return { load, retry, setData: (data: T) => setLoad({ status: "ready", data }) };
}
