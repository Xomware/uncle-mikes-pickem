import type { Game, PickEntry, Team, WeekPicks, WeekView } from "@/lib/api/client";

export type Outcome = "correct" | "wrong" | null;

/** Green or red once the game has a winner. A tie stays neutral: how it scores is a group rule, graded in F7. */
export function outcome(pick: PickEntry | undefined, game: Game): Outcome {
  if (!pick?.team || !game.winner || game.winner === "TIE") return null;
  return pick.team === game.winner ? "correct" : "wrong";
}

/** One row per member, the caller first, then by name. `picks` is null for a member who never saved. */
export function gridRows(view: WeekView, me: string) {
  const bySub = Object.fromEntries(view.picks.map((p) => [p.sub, p]));
  return view.members
    .map((m) => ({ ...m, picks: bySub[m.sub] ?? null }))
    .sort((a, b) => Number(b.sub === me) - Number(a.sub === me) || a.name.localeCompare(b.name));
}

/**
 * A pick sheet is a ranking: open games in order, top row worth N, last worth 1.
 * Every row always holds a confidence, so 1..N stays unique by construction and
 * reordering is the only way to change one.
 */
export interface Sheet {
  order: string[];
  teams: Record<string, string | null>;
  tiebreak: string;
}

export const picksHref = (groupId: string, week?: number) =>
  `/picks/?id=${encodeURIComponent(groupId)}${week ? `&week=${week}` : ""}`;

export function toSheet(games: Game[], mine: WeekPicks | null): Sheet {
  const open = games.filter((g) => !g.canceled).map((g) => g.gameId);
  const saved = mine?.picks ?? {};
  // Saved games by confidence, highest first; a game with no saved pick (new, or restored
  // after a cancel) goes to the bottom in kickoff order.
  const ranked = open.filter((id) => saved[id]).sort((a, b) => saved[b].conf - saved[a].conf);
  const order = [...ranked, ...open.filter((id) => !saved[id])];
  return {
    order,
    teams: Object.fromEntries(order.map((id) => [id, saved[id]?.team ?? null])),
    tiebreak: mine?.tiebreak == null ? "" : String(mine.tiebreak),
  };
}

export function toPayload(sheet: Sheet): { picks: Record<string, PickEntry>; tiebreak: number | null } {
  const n = sheet.order.length;
  const picks = Object.fromEntries(sheet.order.map((id, i) => [id, { team: sheet.teams[id], conf: n - i }]));
  const tiebreak = sheet.tiebreak.trim();
  return { picks, tiebreak: /^\d+$/.test(tiebreak) ? Number(tiebreak) : null };
}

export const confAt = (sheet: Sheet, index: number) => sheet.order.length - index;

export function swap(order: string[], i: number, j: number): string[] {
  if (i === j || i < 0 || j < 0 || i >= order.length || j >= order.length) return order;
  const next = [...order];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export const pickedCount = (sheet: Sheet) => sheet.order.filter((id) => sheet.teams[id]).length;

export const isComplete = (sheet: Sheet) =>
  pickedCount(sheet) === sheet.order.length && toPayload(sheet).tiebreak !== null;

export const sameSheet = (a: Sheet, b: Sheet) => JSON.stringify(toPayload(a)) === JSON.stringify(toPayload(b));

/** "2d 4h", "3h 12m", "4m 09s", or null once the time has passed. */
export function countdown(ms: number): string | null {
  if (ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  const [d, h, m] = [Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60)];
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${String(s % 60).padStart(2, "0")}s`;
}

/** The line as ESPN words it ("KC -3.5"), else built from the home spread. */
export function spreadText(game: {
  away: Team;
  home: Team;
  lines: { details?: string | null; spread?: number | null } | null;
}): string | null {
  const lines = game.lines;
  if (!lines) return null;
  if (lines.details) return lines.details;
  if (lines.spread == null) return null;
  if (lines.spread === 0) return "EVEN";
  return lines.spread < 0 ? `${game.home.abbr} ${lines.spread}` : `${game.away.abbr} -${lines.spread}`;
}
