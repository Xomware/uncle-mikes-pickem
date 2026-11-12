import { describe, expect, it } from "vitest";

import { gameHref, initials, moneyline, severity } from "./game";

describe("game helpers", () => {
  it("links a game by group and ESPN id", () => {
    expect(gameHref("g 1", "401873052")).toBe("/game/?groupId=g%201&gameId=401873052");
  });

  it("ranks ESPN statuses, with anything unknown as other", () => {
    expect(["Out", "Doubtful", "Questionable", "IR", "Suspension"].map(severity)).toEqual([
      "out",
      "doubtful",
      "questionable",
      "ir",
      "other",
    ]);
  });

  it("takes first and last initials, skipping suffixes", () => {
    expect(initials("Tyrone Tracy Jr.")).toBe("TT");
    expect(initials("J.J. McCarthy")).toBe("JM");
    expect(initials("Daron Payne")).toBe("DP");
    expect(initials("Hollywood")).toBe("H");
  });

  it("signs moneylines", () => {
    expect([moneyline(110), moneyline(-130), moneyline(null)]).toEqual(["+110", "-130", null]);
  });
});
