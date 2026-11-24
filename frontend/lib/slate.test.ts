import { describe, expect, it } from "vitest";

import type { SlateGame, SlateGroup } from "@/lib/api/client";

import { adjacentWeeks, byDay, covered, infoGroupId, kickoffTime } from "./slate";

const game = (gameId: string, kickoff: string, timeValid = true): SlateGame => ({
  gameId,
  week: 11,
  kickoff,
  timeValid,
  state: "pre",
  completed: false,
  awayScore: null,
  homeScore: null,
  winner: null,
  tie: false,
  away: { abbr: "BAL", record: "6-3" },
  home: { abbr: "KC", record: "7-2" },
  lines: null,
  broadcasts: [],
  hype: null,
});

const group = (groupId: string, replay: boolean): SlateGroup => ({ groupId, name: groupId, replay, picks: null });

describe("slate", () => {
  it("groups games by Eastern day, so a late Thursday kickoff stays on Thursday", () => {
    const days = byDay([
      game("1", "2026-11-20T01:15:00Z"),
      game("2", "2026-11-22T18:00:00Z"),
      game("3", "2026-11-22T21:25:00Z"),
      game("4", "2026-11-24T01:15:00Z"),
    ]);
    expect(days.map((d) => [d.day, d.games.map((g) => g.gameId)])).toEqual([
      ["Thursday, Nov 19", ["1"]],
      ["Sunday, Nov 22", ["2", "3"]],
      ["Monday, Nov 23", ["4"]],
    ]);
  });

  it("shows kickoff in Eastern, or TBD before the NFL sets it", () => {
    expect(kickoffTime(game("1", "2026-11-22T18:00:00Z"))).toBe("1:00 PM");
    expect(kickoffTime(game("1", "2026-11-22T18:00:00Z", false))).toBe("TBD");
  });

  it("steps to the nearest scheduled week, skipping gaps", () => {
    expect(adjacentWeeks([10, 11, 13], 11)).toEqual({ prev: 10, next: 13 });
    expect(adjacentWeeks([10, 11], 10)).toEqual({ prev: null, next: 11 });
  });

  it("names who covered the home line", () => {
    const final = (awayScore: number, homeScore: number, spread: number | null) => ({
      ...game("1", "2026-11-22T18:00:00Z"),
      completed: true,
      awayScore,
      homeScore,
      lines: { spread },
    });
    expect(covered(final(20, 27, -3.5))).toBe("KC");
    expect(covered(final(24, 27, -3.5))).toBe("BAL");
    expect(covered(final(24, 27, -3))).toBe("PUSH");
    expect(covered(final(30, 27, 2.5))).toBe("BAL");
    expect(covered(final(20, 27, null))).toBeNull();
    expect(covered(game("1", "2026-11-22T18:00:00Z"))).toBeNull();
  });

  it("links game info through a live group only", () => {
    expect(infoGroupId([group("r", true), group("live", false)])).toBe("live");
    expect(infoGroupId([group("r", true)])).toBeNull();
  });
});
