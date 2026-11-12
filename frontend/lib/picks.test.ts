import { describe, expect, it } from "vitest";

import type { Game, WeekPicks } from "@/lib/api/client";

import { countdown, isComplete, spreadText, swap, toPayload, toSheet } from "./picks";

const game = (gameId: string, away: string, home: string, extra: Partial<Game> = {}): Game => ({
  gameId,
  kickoff: "2027-09-10T00:20:00Z",
  away: { abbr: away },
  home: { abbr: home },
  lines: null,
  broadcasts: [],
  state: "pre",
  completed: false,
  winner: null,
  canceled: false,
  ...extra,
});

const GAMES = [game("101", "BAL", "KC"), game("102", "PIT", "CIN"), game("103", "DAL", "PHI")];

const mine = (picks: WeekPicks["picks"], tiebreak: number | null = 44): WeekPicks => ({
  sub: "u-pat",
  picks,
  tiebreak,
  complete: false,
  submittedAt: "",
});

describe("pick sheet", () => {
  it("starts in kickoff order with nothing picked, and every game ranked", () => {
    const sheet = toSheet(GAMES, null);
    expect(sheet.order).toEqual(["101", "102", "103"]);
    expect(toPayload(sheet)).toEqual({
      picks: {
        "101": { team: null, conf: 3 },
        "102": { team: null, conf: 2 },
        "103": { team: null, conf: 1 },
      },
      tiebreak: null,
    });
  });

  it("restores a saved ranking and round-trips it", () => {
    const saved = { "101": { team: "KC", conf: 1 }, "102": { team: "PIT", conf: 3 }, "103": { team: "PHI", conf: 2 } };
    const sheet = toSheet(GAMES, mine(saved));
    expect(sheet.order).toEqual(["102", "103", "101"]);
    expect(toPayload(sheet)).toEqual({ picks: saved, tiebreak: 44 });
    expect(isComplete(sheet)).toBe(true);
  });

  it("leaves canceled games out and puts a game with no saved pick at the bottom", () => {
    const games = [GAMES[0], { ...GAMES[1], canceled: true }, GAMES[2], game("104", "SF", "LAR")];
    const sheet = toSheet(games, mine({ "101": { team: "KC", conf: 1 }, "103": { team: "PHI", conf: 2 } }));
    expect(sheet.order).toEqual(["103", "101", "104"]);
    expect(toPayload(sheet).picks).toEqual({
      "103": { team: "PHI", conf: 3 },
      "101": { team: "KC", conf: 2 },
      "104": { team: null, conf: 1 },
    });
    expect(isComplete(sheet)).toBe(false);
  });

  it("swaps two rows, so their confidences trade", () => {
    expect(swap(["a", "b", "c"], 0, 2)).toEqual(["c", "b", "a"]);
    expect(swap(["a", "b", "c"], 0, 3)).toEqual(["a", "b", "c"]);
  });

  it("sends a tiebreak only when it is a whole number", () => {
    const sheet = toSheet(GAMES, null);
    expect(toPayload({ ...sheet, tiebreak: " 47 " }).tiebreak).toBe(47);
    expect(toPayload({ ...sheet, tiebreak: "47.5" }).tiebreak).toBeNull();
    expect(toPayload({ ...sheet, tiebreak: "-3" }).tiebreak).toBeNull();
  });
});

describe("display", () => {
  it("counts down to lock", () => {
    expect(countdown(0)).toBeNull();
    expect(countdown((2 * 86400 + 4 * 3600 + 59) * 1000)).toBe("2d 4h");
    expect(countdown((3 * 3600 + 12 * 60) * 1000)).toBe("3h 12m");
    expect(countdown((4 * 60 + 9) * 1000)).toBe("4m 09s");
  });

  it("words the spread", () => {
    expect(spreadText(GAMES[0])).toBeNull();
    const line = (spread: number) => ({ spread, overUnder: 47.5, details: null });
    expect(spreadText({ ...GAMES[0], lines: line(-3.5) })).toBe("KC -3.5");
    expect(spreadText({ ...GAMES[0], lines: line(2) })).toBe("BAL -2");
    expect(spreadText({ ...GAMES[0], lines: { ...line(-3.5), details: "KC -3.5" } })).toBe("KC -3.5");
  });
});
