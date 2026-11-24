import type { GroupRank, PickTally, TeamTotal } from "@/lib/api/client";

const decided = (t: PickTally) => t.correct + t.wrong + t.ties;

/** Right picks over decided picks, as "62.5%", or "-" with none decided. */
export function rightPct(t: PickTally): string {
  const n = decided(t);
  return n ? `${((100 * t.correct) / n).toFixed(1)}%` : "-";
}

export const avgPoints = (g: GroupRank) => (g.sheets ? (g.points / g.sheets).toFixed(1) : "-");

export type TeamSort = "picks" | "points" | "pct";

export function sortTeams(teams: TeamTotal[], by: TeamSort): TeamTotal[] {
  const pct = (t: TeamTotal) => (decided(t) ? t.correct / decided(t) : 0);
  const key = { picks: (t: TeamTotal) => t.picks, points: (t: TeamTotal) => t.points, pct }[by];
  return [...teams].sort((a, b) => key(b) - key(a) || b.picks - a.picks || a.team.localeCompare(b.team));
}
