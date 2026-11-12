/** The only season with replay data; the real launch is 2027. */
export const REPLAY_SEASON = 2026;

// Matches groups.BEFORE_LOCK on the server: a week's picks open, the previous week graded.
const BEFORE_LOCK_MS = 60 * 60 * 1000;

export const weekJump = (lockAt: string) => new Date(Date.parse(lockAt) - BEFORE_LOCK_MS).toISOString();

/** The week whose picks are open at `clock`, or null once every week has locked. */
export function openWeek(clock: string, lockAts: Record<string, string>): number | null {
  const now = Date.parse(clock);
  const open = Object.entries(lockAts)
    .filter(([, lockAt]) => Date.parse(lockAt) > now)
    .map(([week]) => Number(week));
  return open.length ? Math.min(...open) : null;
}

/** A datetime-local value (browser time) for an ISO instant, and back. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export const fromLocalInput = (value: string) => new Date(value).toISOString();
