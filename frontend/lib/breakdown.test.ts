import { expect, it } from "vitest";

import type { Game, WeekPicks } from "./api/client";
import { breakdown } from "./breakdown";

const game = (gameId: string, away: string, home: string, canceled = false): Game => ({
  gameId,
  kickoff: "2026-11-15T18:00:00Z",
  away: { abbr: away },
  home: { abbr: home },
  lines: null,
  broadcasts: null,
  state: "pre",
  completed: false,
  winner: null,
  canceled,
});

const sheet = (sub: string, picks: Record<string, [string | null, number]>): WeekPicks => ({
  sub,
  picks: Object.fromEntries(Object.entries(picks).map(([id, [team, conf]]) => [id, { team, conf }])),
  tiebreak: 40,
  complete: true,
  submittedAt: "2026-11-12T00:00:00Z",
});

const games = [game("1", "NYJ", "BUF"), game("2", "KC", "DEN"), game("3", "LV", "LAC", true)];
const picks = [
  sheet("a", { "1": ["BUF", 2], "2": ["KC", 1] }),
  sheet("b", { "1": ["BUF", 1], "2": ["KC", 2] }),
  sheet("c", { "1": ["BUF", 2], "2": ["DEN", 1] }),
  sheet("d", { "1": ["NYJ", 1], "2": [null, 2] }),
];

it("splits each open game with shares and average confidence, GOW first", () => {
  const [gow, other] = breakdown(games, picks, "2");
  expect(gow.game.gameId).toBe("2");
  // d left game 2 unpicked, so the shares are of the three who picked it.
  expect(gow.away).toEqual({ abbr: "KC", count: 2, share: 2 / 3, avgConf: 1.5 });
  expect(gow.home).toEqual({ abbr: "DEN", count: 1, share: 1 / 3, avgConf: 1 });
  expect(gow.contrarian).toEqual([]);

  expect(other.home).toEqual({ abbr: "BUF", count: 3, share: 0.75, avgConf: 5 / 3 });
  expect(other.away.avgConf).toBe(1);
  expect(other.contrarian).toEqual([{ sub: "d", team: "NYJ", conf: 1 }]);
});

it("leaves out canceled games and shows an unpicked side as empty", () => {
  const splits = breakdown(games, [picks[0]], null);
  expect(splits.map((s) => s.game.gameId)).toEqual(["1", "2"]);
  expect(splits[0].away).toEqual({ abbr: "NYJ", count: 0, share: 0, avgConf: null });
  expect(splits[0].contrarian).toEqual([]);
});
