import { describe, expect, it } from "vitest";

import type { Game } from "@/lib/api/client";

import { finalLabel, gameClock, inLiveWindow, pickMark } from "./live";

const KICKOFF = "2026-11-15T18:00:00Z";
const at = (iso: string) => Date.parse(iso);

const game = (extra: Partial<Game> = {}): Game => ({
  gameId: "1",
  kickoff: KICKOFF,
  away: { abbr: "BAL" },
  home: { abbr: "KC" },
  lines: null,
  broadcasts: [],
  state: "pre",
  completed: false,
  winner: null,
  awayScore: null,
  homeScore: null,
  status: null,
  period: null,
  clock: null,
  canceled: false,
  ...extra,
});

describe("inLiveWindow", () => {
  it("opens 15 minutes before kickoff, not earlier", () => {
    expect(inLiveWindow([game()], at("2026-11-15T17:44:59Z"))).toBe(false);
    expect(inLiveWindow([game()], at("2026-11-15T17:45:00Z"))).toBe(true);
  });

  it("stays open while a game is on and closes once every game is final", () => {
    const live = game({ state: "in" });
    expect(inLiveWindow([live], at("2026-11-15T20:30:00Z"))).toBe(true);
    expect(inLiveWindow([game({ state: "post", completed: true })], at("2026-11-15T20:30:00Z"))).toBe(false);
  });

  it("stops 6 hours after kickoff for a game that never finished", () => {
    expect(inLiveWindow([game({ state: "in" })], at("2026-11-15T23:59:59Z"))).toBe(true);
    expect(inLiveWindow([game({ state: "in" })], at("2026-11-16T00:00:00Z"))).toBe(false);
  });

  it("ignores canceled games, and any one game in the window is enough", () => {
    const now = at("2026-11-15T19:00:00Z");
    expect(inLiveWindow([game({ canceled: true })], now)).toBe(false);
    expect(inLiveWindow([game({ completed: true }), game({ kickoff: "2026-11-15T18:05:00Z" })], now)).toBe(true);
    expect(inLiveWindow([], now)).toBe(false);
  });
});

describe("gameClock", () => {
  it("reads quarter and clock, halftime, period breaks and overtime", () => {
    expect(gameClock({ status: "STATUS_IN_PROGRESS", period: 3, clock: "4:12" })).toBe("Q3 4:12");
    expect(gameClock({ status: "STATUS_HALFTIME", period: 2, clock: "0:00" })).toBe("HALF");
    expect(gameClock({ status: "STATUS_END_PERIOD", period: 1, clock: "0:00" })).toBe("END Q1");
    expect(gameClock({ status: "STATUS_IN_PROGRESS", period: 5, clock: "8:30" })).toBe("OT 8:30");
    expect(gameClock({ status: null, period: null, clock: null })).toBe("");
  });

  it("marks an overtime final", () => {
    expect(finalLabel("STATUS_FINAL")).toBe("FINAL");
    expect(finalLabel("STATUS_FINAL_OVERTIME")).toBe("FINAL/OT");
  });
});

describe("pickMark", () => {
  const kc = { team: "KC", conf: 3 };
  const live = (awayScore: number, homeScore: number) => game({ state: "in", awayScore, homeScore });

  it("marks a pick winning or losing on the live score, and leaves a level game alone", () => {
    expect(pickMark(kc, live(3, 10))).toEqual({ result: "correct", live: true });
    expect(pickMark(kc, live(14, 10))).toEqual({ result: "wrong", live: true });
    expect(pickMark(kc, live(7, 7))).toBeNull();
    expect(pickMark(undefined, live(3, 10))).toBeNull();
    expect(pickMark(kc, game())).toBeNull();
  });

  it("is won or lost once the game has a winner", () => {
    const final = game({ state: "post", completed: true, winner: "BAL", awayScore: 20, homeScore: 17 });
    expect(pickMark(kc, final)).toEqual({ result: "wrong", live: false });
  });

  it("takes the grade over the scoreboard, but not a pending one", () => {
    expect(pickMark(kc, live(14, 10), "right")).toEqual({ result: "correct", live: false });
    expect(pickMark(kc, live(14, 10), "void")).toBeNull();
    expect(pickMark(kc, live(14, 10), "pending")).toEqual({ result: "wrong", live: true });
  });
});
