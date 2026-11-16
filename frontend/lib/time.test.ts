import { describe, expect, it } from "vitest";

import { etDate, etTime } from "./time";

describe("etDate", () => {
  it("dates a Thursday night game by its Eastern day, not UTC's Friday", () => {
    expect(etDate("2026-11-13T01:15:00Z")).toBe("Thu, Nov 12 · 8:15 PM ET");
  });
});

describe("etTime", () => {
  it("shows Week 10 kickoffs on the Eastern clock", () => {
    expect(etTime("2026-11-13T01:15:00Z")).toBe("Thu 8:15 PM ET");
    expect(etTime("2026-11-15T14:30:00Z")).toBe("Sun 9:30 AM ET");
    expect(etTime("2026-11-15T18:00:00Z")).toBe("Sun 1:00 PM ET");
  });

  it("follows daylight time", () => {
    expect(etTime("2026-10-11T17:00:00Z")).toBe("Sun 1:00 PM ET");
  });
});
