import type { Game, RootSplit, WeekOdds } from "@/lib/api/client";

/** "37%", with the ends kept honest: a sim's 99.6% is not a lock. */
export function pct(p: number): string {
  if (p > 0 && p < 0.005) return "<1%";
  if (p < 1 && p >= 0.995) return ">99%";
  return `${Math.round(p * 100)}%`;
}

export interface Root {
  game: Game;
  side: "away" | "home";
  /** Percentage points the result moves this member's chance to win the week. */
  swing: number;
}

/** Below half a point a game doesn't matter to this member. */
const NO_SWING = 0.005;

/** The side to root for in each undecided game, biggest swing first. Games that can't move the odds are left out. */
export function rooting(odds: WeekOdds, sub: string, games: Game[]): Root[] {
  const root: Record<string, RootSplit> = odds.members.find((m) => m.sub === sub)?.root ?? {};
  return games
    .flatMap((game) => {
      const split = root[game.gameId];
      if (!split || split.away === null || split.home === null) return [];
      const swing = Math.abs(split.home - split.away);
      if (swing < NO_SWING) return [];
      return [{ game, side: split.home > split.away ? ("home" as const) : ("away" as const), swing }];
    })
    .sort((a, b) => b.swing - a.swing);
}
