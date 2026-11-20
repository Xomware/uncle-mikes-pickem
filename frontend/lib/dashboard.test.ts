import { expect, it } from "vitest";

import type { Game, WeekPicks, WeekView } from "./api/client";
import { sheetStatus, winnerWeeks } from "./dashboard";

const game = (gameId: string, canceled = false) => ({ gameId, canceled }) as Game;

function view(locked: boolean, mine: Partial<WeekPicks> | null, week = 5): WeekView {
  return {
    week: { week, locked },
    games: [game("a"), game("b"), game("c", true)],
    mine: mine && { picks: {}, complete: false, ...mine },
  } as unknown as WeekView;
}

it("reads the sheet before lock", () => {
  expect(sheetStatus(view(false, null)).label).toBe("Not started");
  expect(sheetStatus(view(false, { picks: { a: { team: null, conf: 1 } } })).state).toBe("none");
  // The canceled game isn't counted.
  expect(sheetStatus(view(false, { picks: { a: { team: "KC", conf: 2 }, b: { team: null, conf: 1 } } })).label).toBe(
    "1 of 2 picked",
  );
  expect(sheetStatus(view(false, { complete: true, picks: { a: { team: "KC", conf: 2 } } })).state).toBe("done");
});

it("reads the sheet after lock", () => {
  expect(sheetStatus(view(true, { complete: true })).state).toBe("in");
  expect(sheetStatus(view(true, { complete: false })).state).toBe("missed");
  expect(sheetStatus(view(true, null)).state).toBe("missed");
});

it("looks for the latest winner in this week once locked, else last week", () => {
  expect(winnerWeeks(view(true, null))).toEqual([5, 4]);
  expect(winnerWeeks(view(false, null))).toEqual([4, 3]);
  expect(winnerWeeks(view(false, null, 1))).toEqual([]);
  expect(winnerWeeks(view(true, null, 1))).toEqual([1]);
});
