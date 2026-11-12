import { describe, expect, it } from "vitest";

import { groupHref, inviteUrl, seasonOptions } from "./groups";

describe("groups helpers", () => {
  it("treats January and February as the season that started the year before", () => {
    expect(seasonOptions(new Date(2027, 0, 15))).toEqual([2026, 2027]);
    expect(seasonOptions(new Date(2027, 1, 28))).toEqual([2026, 2027]);
    expect(seasonOptions(new Date(2027, 2, 1))).toEqual([2027, 2028]);
    expect(seasonOptions(new Date(2026, 10, 12))).toEqual([2026, 2027]);
  });

  it("builds query-param links, since static export can't prerender ids", () => {
    expect(groupHref("abc123")).toBe("/group/?id=abc123");
    expect(inviteUrl("https://pickem.xomware.com", "a-b_c")).toBe("https://pickem.xomware.com/join/?code=a-b_c");
  });
});
