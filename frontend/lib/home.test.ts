import { describe, expect, it } from "vitest";

import type { PickEntry, SlateGame, SlateGroup } from "@/lib/api/client";

import { lockAt, pickStatus, scoreStrip } from "./home";

const game = (gameId: string, kickoff: string, state: SlateGame["state"] = "pre"): SlateGame => ({
  gameId,
  week: 12,
  kickoff,
  timeValid: true,
  state,
  status: null,
  period: null,
  clock: null,
  completed: state === "post",
  awayScore: null,
  homeScore: null,
  winner: null,
  tie: false,
  away: { abbr: "BAL", record: null },
  home: { abbr: "KC", record: null },
  lines: null,
  broadcasts: [],
  hype: null,
});

const group = (picks: Record<string, PickEntry> | null): SlateGroup => ({ groupId: "g", name: "G", replay: false, picks });

describe("home", () => {
  it("locks at the first kickoff, whatever order the games come in", () => {
    expect(lockAt([game("2", "2026-11-29T18:00:00Z"), game("1", "2026-11-27T01:15:00Z")])).toBe("2026-11-27T01:15:00.000Z");
    expect(lockAt([])).toBeNull();
  });

  it("counts only picks with a team", () => {
    expect(pickStatus(group(null), 14)).toEqual({ label: "Not started", done: false });
    expect(pickStatus(group({ a: { team: null, conf: 1 } }), 14)).toEqual({ label: "Not started", done: false });
    const seven = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`g${i}`, { team: "KC", conf: i + 1 }]));
    expect(pickStatus(group(seven), 14)).toEqual({ label: "7 of 14 picked", done: false });
    expect(pickStatus(group(seven), 7)).toEqual({ label: "All in", done: true });
  });

  it("puts live games ahead of finals and leaves out games not started", () => {
    const strip = scoreStrip([
      game("a", "2026-11-27T01:15:00Z", "post"),
      game("b", "2026-11-29T18:00:00Z", "in"),
      game("c", "2026-11-29T21:25:00Z", "pre"),
      game("d", "2026-11-29T18:00:00Z", "post"),
    ]);
    expect(strip.map((g) => g.gameId)).toEqual(["b", "a", "d"]);
  });
});
