import { describe, expect, it } from "vitest";

import type { ScheduleGame, TeamRecord, WinLoss } from "@/lib/api/client";

import { atsResult, divisions, lineText, pickOutcome, recordText, seasonLine, splitSchedule, teamHref, teamsHref, winPct } from "./teams";

const rec = (w: number, l: number, t = 0): WinLoss => ({ w, l, t });

const team = (abbr: string, division: TeamRecord["division"], overall: WinLoss, diff = 0): TeamRecord => ({
  abbr,
  name: abbr,
  conference: "AFC",
  division,
  overall,
  home: rec(0, 0),
  road: rec(0, 0),
  divisionRecord: rec(0, 0),
  pointsFor: 100 + diff,
  pointsAgainst: 100,
  form: [],
});

describe("teams", () => {
  it("links carry the group when there is one", () => {
    expect(teamHref("KC")).toBe("/team/?team=KC");
    expect(teamHref("KC", "g 1")).toBe("/team/?team=KC&groupId=g+1");
    expect(teamsHref()).toBe("/teams/");
    expect(teamsHref("g")).toBe("/teams/?groupId=g");
  });

  it("reads records and lines the NFL way", () => {
    expect(recordText(rec(9, 3))).toBe("9-3");
    expect(recordText(rec(5, 2, 1))).toBe("5-2-1");
    expect(winPct(rec(5, 2, 1))).toBe(0.6875);
    expect(winPct(rec(0, 0))).toBe(0);
    expect([lineText(-3.5), lineText(2), lineText(0), lineText(null)]).toEqual(["-3.5", "+2", "PK", null]);
  });

  it("grades a pick for or against the team by its result", () => {
    const game = (result: ScheduleGame["result"]) => ({ result }) as ScheduleGame;
    expect(pickOutcome(game("W"), "KC", "KC")).toBe("correct");
    expect(pickOutcome(game("W"), "KC", "LV")).toBe("wrong");
    expect(pickOutcome(game("L"), "KC", "LV")).toBe("correct");
    expect(pickOutcome(game("T"), "KC", "KC")).toBeNull();
    expect(pickOutcome(game(null), "KC", "KC")).toBeNull();
  });

  it("grades the team against its own spread", () => {
    const final = (score: number, opponentScore: number, spread: number | null) =>
      ({ result: score > opponentScore ? "W" : "L", score, opponentScore, spread }) as ScheduleGame;
    expect(atsResult(final(27, 20, -6.5))).toBe("W");
    expect(atsResult(final(27, 24, -6.5))).toBe("L");
    expect(atsResult(final(20, 23, 3))).toBe("P");
    expect(atsResult(final(20, 23, null))).toBeNull();
    expect(atsResult({ result: null, score: null, opponentScore: null, spread: -3 })).toBeNull();
  });

  it("splits the schedule at the next game still to play", () => {
    const row = (week: number, result: ScheduleGame["result"], state: ScheduleGame["state"] = "post") =>
      ({ week, bye: false, result, state }) as ScheduleGame;
    const bye = { week: 3, bye: true } as const;
    const { played, upcoming } = splitSchedule([row(1, "W"), row(2, "L"), bye, row(4, null, "in"), row(5, null, "pre"), row(6, null, "pre")]);
    expect(played.map((r) => r.week)).toEqual([1, 2, 3, 4]);
    expect(upcoming.map((r) => r.week)).toEqual([5, 6]);
    expect(splitSchedule([row(1, "W")]).upcoming).toEqual([]);
  });

  it("names the season, the group and a replay's clock", () => {
    const data = { season: 2026, replay: true, now: "2026-09-20T17:00:00Z", group: { groupId: "g", name: "Mikes" }, teams: [], team: null };
    expect(seasonLine(data)).toBe("2026 season · Mikes · Replay as of Sun, Sep 20 · 1:00 PM ET");
    expect(seasonLine({ ...data, replay: false, group: null })).toBe("2026 season");
  });

  it("groups by division, best record first, point differential breaking ties", () => {
    const table = divisions([
      team("NYJ", "East", rec(3, 5)),
      team("MIA", "East", rec(5, 3), -10),
      team("BUF", "East", rec(5, 3), 20),
      team("KC", "West", rec(7, 1)),
    ]);
    expect(table).toHaveLength(8);
    expect(table[0]).toMatchObject({ conference: "AFC", division: "East" });
    expect(table[0].teams.map((t) => t.abbr)).toEqual(["BUF", "MIA", "NYJ"]);
    expect(table[3].teams.map((t) => t.abbr)).toEqual(["KC"]);
    expect(table[4]).toMatchObject({ conference: "NFC", division: "East", teams: [] });
  });
});
