import { describe, expect, it } from "vitest";

import type { Payout, Payouts } from "@/lib/api/client";

import { cents, deathStatus, linesFor, seasonStatus, weeklyPaid } from "./payouts";

const line = (over: Partial<Payout>): Payout => ({
  pot: "weekly",
  week: 1,
  sub: "a",
  name: "Amy",
  amount: 150,
  final: true,
  sent: false,
  ...over,
});

const BOOK: Payouts = {
  group: { groupId: "g", name: "Pool", season: 2027 },
  role: "member",
  throughWeek: 2,
  weeks: [],
  season: { pot: 10800, accrued: 1200, final: false, throughWeek: 2 },
  death: { pot: 6000, entries: 3, alive: 2, decided: false, winners: [] },
  payouts: [
    line({}),
    line({ sub: "z", name: "Zed" }),
    line({ week: 2, amount: 300, final: false }),
    line({ pot: "yearly", week: null, amount: 6480, final: false }),
  ],
  members: [],
};

describe("payouts", () => {
  it("formats cents as dollars, with cents only when there are some", () => {
    expect(cents(300)).toBe("$3");
    expect(cents(6667)).toBe("$66.67");
  });

  it("finds a pot's lines and counts only settled weekly payouts as paid", () => {
    expect(linesFor(BOOK, "weekly", 1).map((p) => p.name)).toEqual(["Amy", "Zed"]);
    expect(linesFor(BOOK, "yearly")).toHaveLength(1);
    expect(weeklyPaid(BOOK)).toBe(300);
  });

  it("describes the season pot and the death pool", () => {
    expect(seasonStatus(BOOK)).toBe("Projected · $12 in so far");
    expect(seasonStatus({ ...BOOK, season: { ...BOOK.season, final: true } })).toBe("Final");
    const names = new Map([["a", "Amy"], ["b", "Bo"]]);
    expect(deathStatus(BOOK, names)).toBe("2 of 3 alive");
    const split = { ...BOOK.death, decided: true, winners: [{ entryId: "e1", label: null, sub: "a" }, { entryId: "e2", label: null, sub: "b" }] };
    expect(deathStatus({ ...BOOK, death: split }, names)).toBe("Split by Amy, Bo");
    expect(deathStatus({ ...BOOK, death: { ...split, winners: split.winners.slice(0, 1) } }, names)).toBe("Won by Amy");
  });
});
