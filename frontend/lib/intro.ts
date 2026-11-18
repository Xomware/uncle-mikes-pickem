// A plain module, not "use client", so the gate can be inlined as a script and tested in node.

const SEEN_KEY = "pickem.intro";

/**
 * Decides whether the landing intro plays and marks <html data-intro> "play" or "skip".
 * Runs inline while the HTML parses, before first paint, so it must stay
 * self-contained: INTRO_SCRIPT is this function's own source. It plays once per
 * tab session, never under reduced motion, and not for someone Amplify has
 * signed in on this browser before (it keeps a key ending ".LastAuthUser").
 */
export function introGate(doc: Document, win: Window): boolean {
  let play = false;
  try {
    play =
      win.sessionStorage.getItem("pickem.intro") === null &&
      !win.matchMedia("(prefers-reduced-motion: reduce)").matches &&
      !Object.keys(win.localStorage).some((k) => k.slice(-13) === ".LastAuthUser");
  } catch {
    // Storage blocked (some private modes): no way to play it only once, so don't play it.
  }
  doc.documentElement.setAttribute("data-intro", play ? "play" : "skip");
  return play;
}

export const INTRO_SCRIPT = `(${introGate.toString()})(document, window)`;

/** Ends the intro for this tab: a reload or a trip back to / goes straight to the page. */
export function endIntro(doc: Document, win: Window): void {
  doc.documentElement.setAttribute("data-intro", "done");
  try {
    win.sessionStorage.setItem(SEEN_KEY, "seen");
  } catch {
    // Storage blocked: the attribute still keeps it from replaying until a reload.
  }
}
