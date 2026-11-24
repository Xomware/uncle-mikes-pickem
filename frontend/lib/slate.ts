import type { SlateGame, SlateGroup } from "@/lib/api/client";

const ET = "America/New_York";

export const slateHref = (week: number) => `/slate/?week=${week}`;

/** Games under ET day headings ("Sunday, Nov 22"), in kickoff order as the API sends them. */
export function byDay(games: SlateGame[]): { day: string; games: SlateGame[] }[] {
  const days: { day: string; games: SlateGame[] }[] = [];
  for (const game of games) {
    const day = new Date(game.kickoff).toLocaleDateString("en-US", { timeZone: ET, weekday: "long", month: "short", day: "numeric" });
    const last = days.at(-1);
    if (last?.day === day) last.games.push(game);
    else days.push({ day, games: [game] });
  }
  return days;
}

/** "1:00 PM", or "TBD" while the NFL hasn't set the time. */
export function kickoffTime(game: Pick<SlateGame, "kickoff" | "timeValid">): string {
  if (game.timeValid === false) return "TBD";
  return new Date(game.kickoff).toLocaleTimeString("en-US", { timeZone: ET, hour: "numeric", minute: "2-digit" });
}

/** Who covered the closing spread: a team, "PUSH", or null without a final or a line. */
export function covered(game: Pick<SlateGame, "completed" | "awayScore" | "homeScore" | "lines" | "away" | "home">): string | null {
  const spread = game.lines?.spread;
  if (!game.completed || spread == null || game.awayScore == null || game.homeScore == null) return null;
  const margin = game.homeScore - game.awayScore + spread;
  if (margin === 0) return "PUSH";
  return margin > 0 ? game.home.abbr : game.away.abbr;
}

/** The scheduled weeks either side of `week`, skipping gaps. */
export function adjacentWeeks(weeks: number[], week: number): { prev: number | null; next: number | null } {
  return {
    prev: weeks.filter((w) => w < week).at(-1) ?? null,
    next: weeks.find((w) => w > week) ?? null,
  };
}

/**
 * Game info is read through a group. A replay group would show the game as of its virtual clock,
 * so only a live group will do; with none, matchups aren't links.
 */
export const infoGroupId = (groups: SlateGroup[]) => groups.find((g) => !g.replay)?.groupId ?? null;
