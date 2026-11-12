// Cognito only returns to the one registered callback URL, so the page someone
// started sign-in from is stashed before the redirect and read after it.
// sessionStorage, so a stale target can't hijack an unrelated sign-in days later.

const NEXT_KEY = "pickem.next";
export const DEFAULT_NEXT = "/groups/";

// Same-origin paths only: a leading "//" or a backslash would make this an open redirect.
export function isSafePath(value: string | null | undefined): value is string {
  return Boolean(value && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\"));
}

export function rememberNextPath(path: string): void {
  if (isSafePath(path)) window.sessionStorage.setItem(NEXT_KEY, path);
}

export function takeNextPath(): string {
  const stored = window.sessionStorage.getItem(NEXT_KEY);
  window.sessionStorage.removeItem(NEXT_KEY);
  return isSafePath(stored) && stored !== "/" ? stored : DEFAULT_NEXT;
}
