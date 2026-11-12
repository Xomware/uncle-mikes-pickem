import { describe, expect, it } from "vitest";

import type { Game, SeasonStandings, WeekResult, WeekView } from "@/lib/api/client";

import { byeTeams, easternTime, gameDates, GOW_LABEL, groupGridCsv, slots, standingsCsv } from "./sheet";

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

describe("groupGridCsv", () => {
  const view = {
    games: [WEEK[0], { ...WEEK[1], canceled: true }, WEEK[4]],
    gow: { gameId: "late", chosenBy: "", chosenAt: "" },
    members: [
      { sub: "b", name: "Zed" },
      { sub: "a", name: "Amy" },
    ],
    picks: [{ sub: "b", picks: { tnf: { team: "NE", conf: 2 }, late: { team: "KC", conf: 1 } }, tiebreak: 41 }],
  } as unknown as WeekView;

  it("has a column per open game in sheet order, the GOW marked, and members by name", () => {
    expect(groupGridCsv(view, null)).toEqual([
      ["Member", "NYJ @ NE", "KC @ DEN (GOW)", "Tiebreak", "Points", "Place"],
      ["Amy", null, null, null, null, null],
      ["Zed", "NE 2", "KC 1", 41, null, null],
    ]);
  });

  it("adds weekly points and places once graded", () => {
    const result = { rows: [{ sub: "a", weekly: 0, place: "2" }, { sub: "b", weekly: 3, place: "1" }] } as WeekResult;
    expect(groupGridCsv(view, result).map((r) => r.slice(-2))).toEqual([
      ["Points", "Place"],
      [0, "2"],
      [3, "1"],
    ]);
  });
});

it("lays the season table out by week, blank for a week a late joiner has no score", () => {
  const standings: SeasonStandings = {
    season: 2026,
    throughWeek: 2,
    rows: [
      { sub: "a", name: "Amy", place: "1", total: 210, gow: 12, weeks: { "1": 109, "2": 101 } },
      { sub: "b", name: "Zed", place: "2", total: 96, gow: -15, weeks: { "2": 96 } },
    ],
  };
  expect(standingsCsv(standings)).toEqual([
    ["Pos", "Player", "Week 1", "Week 2", "Total", "GOW"],
    ["1", "Amy", 109, 101, 210, 12],
    ["2", "Zed", null, 96, 96, -15],
  ]);
});
