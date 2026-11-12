import { describe, expect, it } from "vitest";

import type { DeathEntry, DeathGame } from "@/lib/api/client";

import { formatLine, takenTeams, teamLine, withPick } from "./death";

const game: DeathGame = { gameId: "1", kickoff: "", away: "KC", home: "BAL", spread: -3.5, details: "BAL -3.5" };

const entry: DeathEntry = {
  entryId: "e1",
  label: "Pat 1",
  ownerSub: "u-pat",
  ownerName: "Pat",
  mine: true,
  picks: { "1": "GB", "2": "KC" },
  used: ["GB", "KC"],
  livesLeft: 1,
  status: "alive",
  eliminatedWeek: null,
};

describe("death pool helpers", () => {
  it("gives each side its own line from the home spread", () => {
    expect(teamLine(game, "BAL")).toBe(-3.5);
    expect(teamLine(game, "KC")).toBe(3.5);
    expect(teamLine({ ...game, spread: null }, "KC")).toBeNull();
  });

  it("formats lines with a sign, and zero as a pick'em", () => {
    expect(formatLine(-3.5)).toBe("-3.5");
    expect(formatLine(7)).toBe("+7");
    expect(formatLine(0)).toBe("PK");
    expect(formatLine(null)).toBe("");
  });

  it("treats this week's own pick as changeable, not used", () => {
    expect(takenTeams(entry, 2)).toEqual(new Set(["GB"]));
    expect(takenTeams(entry, 3)).toEqual(new Set(["GB", "KC"]));
  });

  it("swaps this week's pick into the entry", () => {
    const next = withPick(entry, 2, "DAL");
    expect(next.picks).toEqual({ "1": "GB", "2": "DAL" });
    expect(next.used).toEqual(["DAL", "GB"]);
  });
});
