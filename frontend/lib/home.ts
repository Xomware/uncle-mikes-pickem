import type { SlateGame, SlateGroup } from "@/lib/api/client";

/** The first kickoff, which is when a live week locks (nfl_store.week_fields). */
export function lockAt(games: SlateGame[]): string | null {
  const first = Math.min(...games.map((g) => Date.parse(g.kickoff)));
  return Number.isFinite(first) ? new Date(first).toISOString() : null;
}

export interface PickStatus {
  label: string;
  done: boolean;
}

export function pickStatus(group: SlateGroup, games: number): PickStatus {
  const picked = Object.values(group.picks ?? {}).filter((p) => p.team).length;
  if (picked === 0) return { label: "Not started", done: false };
  if (picked >= games) return { label: "All in", done: true };
  return { label: `${picked} of ${games} picked`, done: false };
}

/** Games that have kicked off, live ones first, each in kickoff order. */
export const scoreStrip = (games: SlateGame[]) => [
  ...games.filter((g) => g.state === "in"),
  ...games.filter((g) => g.state === "post"),
];
