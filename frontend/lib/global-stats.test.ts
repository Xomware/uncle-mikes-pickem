import { describe, expect, it } from "vitest";

import type { TeamTotal } from "@/lib/api/client";

import { avgPoints, rightPct, sortTeams } from "./global-stats";

const team = (team: string, picks: number, correct: number, points: number): TeamTotal => ({
  team,
  picks,
  correct,
  wrong: picks - correct,
  ties: 0,
  points,
});

describe("global stats", () => {
  it("formats pick % over decided picks", () => {
    expect(rightPct({ correct: 5, wrong: 2, ties: 1 })).toBe("62.5%");
    expect(rightPct({ correct: 0, wrong: 0, ties: 0 })).toBe("-");
  });

  it("averages points per sheet", () => {
    expect(avgPoints({ rank: 1, name: null, players: 2, sheets: 4, points: 90 })).toBe("22.5");
  });

  it("sorts teams by the chosen column, ties by picks then abbr", () => {
    const teams = [team("BUF", 4, 1, 10), team("KC", 4, 3, 30), team("NYJ", 1, 1, 9), team("DAL", 1, 1, 9)];
    expect(sortTeams(teams, "picks").map((t) => t.team)).toEqual(["BUF", "KC", "DAL", "NYJ"]);
    expect(sortTeams(teams, "points").map((t) => t.team)).toEqual(["KC", "BUF", "DAL", "NYJ"]);
    expect(sortTeams(teams, "pct").map((t) => t.team)).toEqual(["DAL", "NYJ", "KC", "BUF"]);
  });
});
