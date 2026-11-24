import { expect, it } from "vitest";

import type { LeaderRow } from "@/lib/api/client";

import { pickPct, pinnedMe, record } from "./leaderboard";

const row = (over: Partial<LeaderRow> = {}): LeaderRow => ({
  sub: "u1",
  rank: 1,
  name: "Dom G.",
  correct: 7,
  wrong: 2,
  ties: 1,
  points: 40,
  won: 0,
  group: null,
  you: false,
  ...over,
});

it("counts a tie as graded but not correct", () => {
  expect(pickPct(row())).toBe("70.0%");
  expect(record(row())).toBe("7-2-1");
  expect(record(row({ ties: 0 }))).toBe("7-2");
});

it("shows a dash before any pick is graded", () => {
  expect(pickPct(row({ correct: 0, wrong: 0, ties: 0 }))).toBe("-");
});

it("pins the caller only when they're off the first page", () => {
  const me = row({ you: true, rank: 60 });
  expect(pinnedMe({ rows: [row()], me, players: 60 })).toBe(me);
  expect(pinnedMe({ rows: [row(), me], me, players: 2 })).toBeNull();
  expect(pinnedMe({ rows: [row()], me: null, players: 1 })).toBeNull();
});
