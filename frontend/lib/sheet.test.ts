import { describe, expect, it } from "vitest";

import type { Game } from "@/lib/api/client";

import { byeTeams, easternTime, gameDates, GOW_LABEL, slots } from "./sheet";

const game = (gameId: string, away: string, home: string, kickoff: string): Game => ({
  gameId,
  kickoff,
  away: { abbr: away },
  home: { abbr: home },
  lines: null,
  broadcasts: [],
  state: "pre",
  completed: false,
  winner: null,
  canceled: false,
});

// A Week 10 shaped like the paper sheet. EST is UTC-5, so Thursday night is Friday in UTC.
const WEEK = [
  game("tnf", "NYJ", "NE", "2026-11-13T01:15:00Z"),
  game("munich", "ATL", "IND", "2026-11-15T14:30:00Z"),
  game("e1", "BUF", "MIA", "2026-11-15T18:00:00Z"),
  game("e2", "CLE", "PIT", "2026-11-15T18:00:00Z"),
  game("late", "KC", "DEN", "2026-11-15T21:25:00Z"),
  game("snf", "DET", "PHI", "2026-11-16T01:20:00Z"),
  game("mnf", "DAL", "LV", "2026-11-17T01:15:00Z"),
];

const labels = (gowId: string | null) => slots(WEEK, gowId).map((s) => [s.label, s.games.map((g) => g.gameId)]);

describe("slots", () => {
  it("groups by the paper sheet's slots in Eastern time, pluralizing shared slots", () => {
    expect(labels(null)).toEqual([
      ["THURSDAY GAME", ["tnf"]],
      ["INTERNATIONAL GAME", ["munich"]],
      ["SUNDAY GAMES", ["e1", "e2", "late"]],
      ["SUNDAY NIGHT GAME", ["snf"]],
      ["MONDAY NIGHT GAME", ["mnf"]],
    ]);
  });

  it("pulls the GOW into its own slot ahead of the slot it came from", () => {
    expect(labels("late")).toEqual([
      ["THURSDAY GAME", ["tnf"]],
      ["INTERNATIONAL GAME", ["munich"]],
      [GOW_LABEL, ["late"]],
      ["SUNDAY GAMES", ["e1", "e2"]],
      ["SUNDAY NIGHT GAME", ["snf"]],
      ["MONDAY NIGHT GAME", ["mnf"]],
    ]);
  });

  it("puts a GOW that empties its slot where that slot was", () => {
    expect(labels("snf").map(([label]) => label)).toEqual([
      "THURSDAY GAME",
      "INTERNATIONAL GAME",
      "SUNDAY GAMES",
      GOW_LABEL,
      "MONDAY NIGHT GAME",
    ]);
  });

  it("marks only the GOW slot", () => {
    expect(slots(WEEK, "mnf").filter((s) => s.gow).map((s) => s.games[0].gameId)).toEqual(["mnf"]);
  });
});

it("lists each game day once, in Eastern time", () => {
  expect(gameDates([...WEEK].reverse())).toBe("11/12, 11/15, 11/16");
});

it("lists the teams without a game", () => {
  expect(byeTeams(WEEK)).toEqual(
    [
      "ARI", "BAL", "CAR", "CHI", "CIN", "GB", "HOU", "JAX", "LAC", "LAR", "MIN", "NO", "NYG", "SEA", "SF", "TB", "TEN",
      "WSH",
    ],
  );
});

it("formats a lock time in Eastern time", () => {
  expect(easternTime("2026-11-13T01:15:00Z")).toBe("THU 11/12 8:15 PM ET");
  expect(easternTime("2026-11-15T17:00:00Z")).toBe("SUN 11/15 12:00 PM ET");
});
