import { describe, expect, it } from "vitest";

import type { Slate, SlateGroup } from "@/lib/api/client";

import { banners } from "./banners";

const LOCK = "2026-11-26T18:00:00Z";
const DUE = "2026-11-24T17:00:00Z";
const group = (extra: Partial<SlateGroup>): SlateGroup => ({
  groupId: "g1", name: "Uncle Mike's", replay: false, picks: null, complete: false, role: "member", gow: { gameId: "1", chosenBy: "u" }, ...extra,
});
const slate = (groups: SlateGroup[], extra: Partial<Slate> = {}): Slate => ({
  season: 2026, week: 12, currentWeek: 12, weeks: [12], archived: false, lockAt: LOCK, gowDeadline: DUE, games: [], groups, ...extra,
});
const before = Date.parse("2026-11-24T12:00:00Z");

describe("banners", () => {
  it("asks for picks until the sheet is complete", () => {
    expect(banners(slate([group({})]), before)).toEqual([
      { kind: "picks", groupId: "g1", group: "Uncle Mike's", week: 12, lockAt: LOCK, progress: "Not started" },
    ]);
    expect(banners(slate([group({ complete: true })]), before)).toEqual([]);
  });

  it("asks an organizer for the GOW before the deadline, and holds picks until it's set", () => {
    const g = group({ role: "owner", gow: null });
    expect(banners(slate([g]), before).map((b) => b.kind)).toEqual(["gow"]);
    expect(banners(slate([group({ gow: null })]), before)).toEqual([]);
    expect(banners(slate([g]), Date.parse(DUE) + 1)).toEqual([]);
  });

  it("says nothing once locked, for another week, or for a replay group", () => {
    expect(banners(slate([group({})]), Date.parse(LOCK))).toEqual([]);
    expect(banners(slate([group({})], { week: 11 }), before)).toEqual([]);
    expect(banners(slate([group({ replay: true })]), before)).toEqual([]);
  });
});
