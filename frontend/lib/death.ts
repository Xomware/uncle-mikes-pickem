import type { DeathEntry, DeathGame } from "@/lib/api/client";

/** The line from `team`'s side. ESPN's spread is the home team's. */
export function teamLine(game: DeathGame, team: string): number | null {
  if (game.spread === null) return null;
  return team === game.home ? game.spread : -game.spread;
}

export function formatLine(line: number | null): string {
  if (line === null) return "";
  if (line === 0) return "PK";
  return line > 0 ? `+${line}` : `${line}`;
}

/** Teams this entry can't pick in `week`. Its current pick for that week can still change. */
export function takenTeams(entry: DeathEntry, week: number): Set<string> {
  const current = entry.picks[String(week)];
  return new Set(entry.used.filter((team) => team !== current));
}

export function gridWeeks(openWeek: number | null, entries: DeathEntry[]): number[] {
  const picked = entries.flatMap((e) => Object.keys(e.picks).map(Number));
  const last = Math.max(1, openWeek ?? 1, ...picked);
  return Array.from({ length: last }, (_, i) => i + 1);
}

export function withPick(entry: DeathEntry, week: number, team: string): DeathEntry {
  const picks = { ...entry.picks, [String(week)]: team };
  const used = Object.values(picks).filter((t): t is string => t !== null);
  return { ...entry, picks, used: used.sort() };
}
