import { describe, expect, it } from "vitest";

import { ago, jobHealth, matches } from "./super";

const NOW = new Date("2027-09-12T18:00:00Z");
const run = (at: string, ok = true) => ({ at, ok, error: ok ? null : "boom", mode: null });

describe("jobHealth", () => {
  it("is amber with no run and red on an error, whatever its age", () => {
    expect(jobHealth("mail_sweep", null, NOW)).toBe("amber");
    expect(jobHealth("mail_sweep", run("2027-09-12T17:59:00Z", false), NOW)).toBe("red");
  });

  it("goes amber when late and red at twice that, per job", () => {
    expect(jobHealth("mail_sweep", run("2027-09-12T17:45:00Z"), NOW)).toBe("green");
    expect(jobHealth("mail_sweep", run("2027-09-12T17:20:00Z"), NOW)).toBe("amber");
    expect(jobHealth("mail_sweep", run("2027-09-12T16:50:00Z"), NOW)).toBe("red");
    expect(jobHealth("capture", run("2027-09-12T14:00:00Z"), NOW)).toBe("green");
    expect(jobHealth("cron_tick", run("2027-09-12T15:00:00Z"), NOW)).toBe("amber");
  });
});

describe("ago", () => {
  it("rounds to minutes, hours, then days", () => {
    expect(ago("2027-09-12T17:56:00Z", NOW)).toBe("4m ago");
    expect(ago("2027-09-12T15:00:00Z", NOW)).toBe("3h ago");
    expect(ago("2027-09-09T18:00:00Z", NOW)).toBe("3d ago");
  });
});

describe("matches", () => {
  it("matches any field, ignoring case, and everything on an empty query", () => {
    expect(matches("sun", "Sunday Crew", null)).toBe(true);
    expect(matches("DOM", "Pool", "dom@example.com")).toBe(true);
    expect(matches("zzz", "Pool")).toBe(false);
    expect(matches("  ", "Pool")).toBe(true);
  });
});
