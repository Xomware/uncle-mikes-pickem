import { describe, expect, it } from "vitest";

import { fromLocalInput, openWeek, toLocalInput, weekJump } from "./replay";

const lockAts = { "1": "2026-09-11T00:20:00Z", "2": "2026-09-18T00:15:00Z", "10": "2026-11-13T01:15:00Z" };

describe("replay clock", () => {
  it("jumps to an hour before a week's lock", () => {
    expect(weekJump("2026-09-11T00:20:00Z")).toBe("2026-09-10T23:20:00.000Z");
  });

  it("finds the week whose picks are open", () => {
    expect(openWeek("2026-09-10T23:20:00Z", lockAts)).toBe(1);
    expect(openWeek("2026-09-11T00:20:00Z", lockAts)).toBe(2);
    expect(openWeek("2026-09-20T00:00:00Z", lockAts)).toBe(10);
    expect(openWeek("2027-01-20T00:00:00Z", lockAts)).toBeNull();
  });

  it("round-trips a datetime-local value", () => {
    const iso = "2026-09-11T00:20:00.000Z";
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
  });
});
