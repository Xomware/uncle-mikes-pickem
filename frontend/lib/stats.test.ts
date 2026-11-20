import { expect, it } from "vitest";

import type { MyStats } from "./api/client";
import { finishes, ordinal, pickRate, recordText, teamSplits } from "./stats";

const team = (abbr: string, right: number, wrong: number, tie = 0) => ({ team: abbr, right, wrong, tie });

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

it("splits teams at .500, rate first and volume breaking ties", () => {
  const teams = [
    team("BUF", 2, 0), team("KC", 4, 0), team("DAL", 3, 1), team("PHI", 1, 1),
    team("NYJ", 0, 3), team("CHI", 1, 2), team("MIA", 1, 0),
  ];
  const { best, worst } = teamSplits(teams);
  // MIA has one pick, under the minimum of two; PHI at .500 misses the top three.
  expect(best.map((t) => t.team)).toEqual(["KC", "BUF", "DAL"]);
  expect(worst.map((t) => t.team)).toEqual(["NYJ", "CHI"]);
});

it("leaves worst empty when no rated team is under .500", () => {
  expect(teamSplits([team("KC", 2, 0), team("BUF", 1, 1)])).toEqual({
    best: [team("KC", 2, 0), team("BUF", 1, 1)],
    worst: [],
  });
});

it("summarises weekly places", () => {
  const week = (place: string) => ({ place }) as MyStats["weeks"][number];
  expect(finishes([week("3"), week("1*"), week("8")])).toEqual({ best: 1, average: 4 });
  expect(finishes([])).toBeNull();
});
