import type { Game, PickEntry, Team, WeekPicks, WeekView } from "@/lib/api/client";

export type Outcome = "correct" | "wrong" | null;

/** Green or red once the game has a winner. A tie stays neutral: how it scores is a group rule, graded in F7. */
export function outcome(pick: PickEntry | undefined, game: Pick<Game, "winner">): Outcome {
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
 * A pick sheet: open games in kickoff order, which never changes. Each game gets a
 * typed confidence; a draft may leave any blank, but the ones it holds must be
 * unique in 1..N before it can save.
 */
export interface Sheet {
  order: string[];
  teams: Record<string, string | null>;
  conf: Record<string, string>;
  tiebreak: string;
}

export const picksHref = (groupId: string, week?: number) =>
  `/picks/?id=${encodeURIComponent(groupId)}${week ? `&week=${week}` : ""}`;

export function toSheet(games: Game[], mine: WeekPicks | null): Sheet {
  const order = games.filter((g) => !g.canceled).map((g) => g.gameId);
  const saved = mine?.picks ?? {};
  return {
    order,
    teams: Object.fromEntries(order.map((id) => [id, saved[id]?.team ?? null])),
    conf: Object.fromEntries(order.map((id) => [id, saved[id]?.conf == null ? "" : String(saved[id].conf)])),
    tiebreak: mine?.tiebreak == null ? "" : String(mine.tiebreak),
  };
}

/** A fresh sheet from the server, keeping whatever the draft holds for games still open. */
export function carry(draft: Sheet, fresh: Sheet): Sheet {
  const keep = (id: string) => draft.order.includes(id);
  return {
    order: fresh.order,
    teams: Object.fromEntries(fresh.order.map((id) => [id, keep(id) ? draft.teams[id] : fresh.teams[id]])),
    conf: Object.fromEntries(fresh.order.map((id) => [id, keep(id) ? draft.conf[id] : fresh.conf[id]])),
    tiebreak: draft.tiebreak,
  };
}

const whole = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s) : null);

export interface ConfCheck {
  /** Points 1..N nobody has used yet. */
  left: number[];
  /** Points typed on more than one game. */
  dupes: number[];
  /** Games whose box holds something that isn't 1..N. */
  bad: string[];
}

export function checkConf(sheet: Sheet): ConfCheck {
  const n = sheet.order.length;
  const counts = new Map<number, number>();
  const bad: string[] = [];
  for (const id of sheet.order) {
    if (sheet.conf[id].trim() === "") continue;
    const c = whole(sheet.conf[id]);
    if (c === null || c < 1 || c > n) bad.push(id);
    else counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return {
    left: Array.from({ length: n }, (_, i) => i + 1).filter((c) => !counts.has(c)),
    dupes: [...counts].filter(([, k]) => k > 1).map(([c]) => c),
    bad,
  };
}

export const confError = ({ dupes, bad }: ConfCheck) => dupes.length > 0 || bad.length > 0;

export function toPayload(sheet: Sheet): { picks: Record<string, PickEntry>; tiebreak: number | null } {
  const picks = Object.fromEntries(
    sheet.order
      .map((id) => [id, { team: sheet.teams[id], conf: whole(sheet.conf[id]) }] as const)
      .filter(([, p]) => p.team !== null || p.conf !== null),
  );
  return { picks, tiebreak: whole(sheet.tiebreak) };
}

export const pickedCount = (sheet: Sheet) => sheet.order.filter((id) => sheet.teams[id]).length;

export function isComplete(sheet: Sheet) {
  const check = checkConf(sheet);
  return pickedCount(sheet) === sheet.order.length && check.left.length === 0 && !confError(check) && whole(sheet.tiebreak) !== null;
}

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
