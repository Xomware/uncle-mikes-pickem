"use client";

import { useEffect, useRef } from "react";

import { POLL_MS } from "@/lib/live";

/**
 * Calls `refresh` every POLL_MS while `active()` holds and the tab is visible, and once on
 * coming back to the tab. `active` is asked on every tick rather than once, so a page left
 * open before kickoff starts polling on its own.
 */
export function usePoll(active: () => boolean, refresh: () => void) {
  const latest = useRef({ active, refresh });
  useEffect(() => {
    latest.current = { active, refresh };
  });

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const tick = () => latest.current.active() && latest.current.refresh();
    const sync = () => {
      clearInterval(timer);
      timer = undefined;
      if (document.visibilityState !== "visible") return;
      timer = setInterval(tick, POLL_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
      sync();
    };
    sync();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
}
