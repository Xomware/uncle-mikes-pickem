import { expect, it } from "vitest";

import { pct, rooting } from "./analytics";
import type { Game, WeekOdds } from "./api/client";

const game = (gameId: string): Game => ({
  gameId,
  kickoff: "2026-11-15T18:00:00Z",
  away: { abbr: `A${gameId}` },
  home: { abbr: `H${gameId}` },
  lines: null,
  broadcasts: null,
  state: "pre",
  completed: false,
  winner: null,
  canceled: false,
});

const odds = (root: WeekOdds["members"][number]["root"]): WeekOdds => ({
  groupId: "g",
  season: 2026,
  week: 10,
  status: "open",
  sims: 10000,
  computedAt: "2026-11-16T00:00:00Z",
  games: {},
  members: [{ sub: "me", name: "Me", pWin: 0.3, root }],
});

it("rounds percentages without calling a long shot zero or a favourite certain", () => {
  expect([0, 0.003, 0.374, 0.996, 1].map(pct)).toEqual(["0%", "<1%", "37%", ">99%", "100%"]);
});

it("roots for the side that raises the odds, biggest swing first", () => {
  const root = {
    "1": { away: 0.2, home: 0.3 },
    "2": { away: 0.5, home: 0.1 },
    "3": { away: 0.3, home: 0.302 },
    "4": { away: null, home: 0.3 },
  };
  const out = rooting(odds(root), "me", ["1", "2", "3", "4", "5"].map(game));
  expect(out.map((r) => [r.game.gameId, r.side, r.swing.toFixed(2)])).toEqual([
    ["2", "away", "0.40"],
    ["1", "home", "0.10"],
  ]);
  expect(rooting(odds(root), "someone else", [game("1")])).toEqual([]);
});
