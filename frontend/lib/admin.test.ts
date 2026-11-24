import { describe, expect, it } from "vitest";

import { gowState, paidState, picksState } from "./admin";
import type { AdminGroup } from "./api/client";

const group = (over: Partial<AdminGroup> = {}): AdminGroup => ({
  groupId: "g",
  name: "Pool",
  season: 2027,
  role: "owner",
  replay: false,
  week: 1,
  lockAt: "2027-09-10T00:20:00Z",
  gow: null,
  gowDeadline: "2027-09-07T16:00:00Z",
  members: 3,
  missing: ["Sam"],
  unpaid: { count: 0, amount: 0, names: [] },
  ...over,
});

const at = (iso: string) => new Date(iso);

describe("gowState", () => {
  it("is done once a game is chosen", () => {
    expect(gowState(group({ gow: { gameId: "1", matchup: "A @ B", chosenBy: "auto" } }), at("2027-09-08T00:00:00Z"))).toBe("done");
  });
  it("turns late at the deadline", () => {
    expect(gowState(group(), at("2027-09-07T15:59:00Z"))).toBe("todo");
    expect(gowState(group(), at("2027-09-07T16:00:00Z"))).toBe("late");
  });
});

describe("picksState", () => {
  it("is done when nobody is missing", () => {
    expect(picksState(group({ missing: [] }), at("2027-09-09T23:00:00Z"))).toBe("done");
  });
  it("turns late inside a day of the lock", () => {
    expect(picksState(group(), at("2027-09-08T00:00:00Z"))).toBe("todo");
    expect(picksState(group(), at("2027-09-09T01:00:00Z"))).toBe("late");
  });
  it("stays a to-do with no lock scheduled", () => {
    expect(picksState(group({ lockAt: null }), at("2027-09-09T23:00:00Z"))).toBe("todo");
  });
});

it("paidState is a to-do while anyone owes", () => {
  expect(paidState({ count: 2, amount: 30, names: ["A", "B"] })).toBe("todo");
  expect(paidState({ count: 0, amount: 0, names: [] })).toBe("done");
});
