import { expect, it } from "vitest";

import type { MyStats } from "./api/client";
import { finishes, ordinal, pickRate, recordText, teamTrends } from "./stats";

const team = (abbr: string, right: number, wrong: number, tie: number, won: number, lost: number) => ({
  team: abbr,
  right,
  wrong,
  tie,
  won,
  lost,
});

it("rates decided picks, ties as misses", () => {
  expect(pickRate({ right: 3, wrong: 1, tie: 0 })).toBe(0.75);
  expect(pickRate({ right: 1, wrong: 0, tie: 1 })).toBe(0.5);
  expect(pickRate({ right: 0, wrong: 0, tie: 0 })).toBeNull();
});

it("writes a record, adding ties only when there are some", () => {
  expect(recordText({ right: 12, wrong: 4, tie: 0 })).toBe("12-4");
  expect(recordText({ right: 12, wrong: 4, tie: 1 })).toBe("12-4-1");
});

it("orders places and drops the tiebreak star", () => {
  expect(["1", "2*", "3", "4", "11", "12", "13", "21", "22", "103"].map(ordinal)).toEqual([
    "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "103rd",
  ]);
});

it("ranks teams by points won and points lost, more picks breaking a tie", () => {
  const teams = [
    team("KC", 3, 0, 0, 30, 0), team("BUF", 2, 1, 0, 20, 5), team("DAL", 1, 0, 0, 20, 0),
    team("NYJ", 0, 3, 0, 0, 25), team("CHI", 1, 2, 0, 4, 12), team("MIA", 0, 0, 1, 0, 0),
  ];
  const { paid, cost } = teamTrends(teams);
  // BUF and DAL both won 20; BUF had more picks. MIA's tie earns and costs nothing.
  expect(paid.map((t) => t.team)).toEqual(["KC", "BUF", "DAL"]);
  expect(cost.map((t) => t.team)).toEqual(["NYJ", "CHI", "BUF"]);
});

it("leaves cost empty when no pick has been wrong", () => {
  expect(teamTrends([team("KC", 2, 0, 0, 7, 0)]).cost).toEqual([]);
});

it("summarises weekly places", () => {
  const week = (place: string) => ({ place }) as MyStats["weeks"][number];
  expect(finishes([week("3"), week("1*"), week("8")])).toEqual({ best: 1, average: 4 });
  expect(finishes([])).toBeNull();
});
