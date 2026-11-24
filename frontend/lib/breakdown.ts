import type { Game, WeekPicks } from "@/lib/api/client";

export interface Side {
  abbr: string;
  count: number;
  /** 0..1 of the members who picked this game. */
  share: number;
  avgConf: number | null;
}

export interface GameSplit {
  game: Game;
  away: Side;
  home: Side;
  /** Members on a side at most CONTRARIAN of the group took. */
  contrarian: { sub: string; team: string; conf: number }[];
}

export const CONTRARIAN = 0.25;

/** How the group split on each open game, GOW first. Built from the picks the API sends after lock. */
export function breakdown(games: Game[], picks: WeekPicks[], gowId: string | null): GameSplit[] {
  const open = games.filter((g) => !g.canceled);
  const splits = open.map((game) => {
    const chosen = picks.flatMap((p) => {
      const pick = p.picks[game.gameId];
      return pick?.team && pick.conf != null ? [{ sub: p.sub, team: pick.team, conf: pick.conf }] : [];
    });
    const side = (abbr: string): Side => {
      const on = chosen.filter((c) => c.team === abbr);
      return {
        abbr,
        count: on.length,
        share: chosen.length ? on.length / chosen.length : 0,
        avgConf: on.length ? on.reduce((sum, c) => sum + c.conf, 0) / on.length : null,
      };
    };
    const away = side(game.away.abbr);
    const home = side(game.home.abbr);
    const lonely = [away, home].filter((s) => s.count > 0 && s.share <= CONTRARIAN).map((s) => s.abbr);
    return { game, away, home, contrarian: chosen.filter((c) => lonely.includes(c.team)) };
  });
  return splits.sort((a, b) => Number(b.game.gameId === gowId) - Number(a.game.gameId === gowId));
}
