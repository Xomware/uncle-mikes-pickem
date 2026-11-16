import { afterEach, describe, expect, it, vi } from "vitest";

import { type GowPeek, blocked, confirmGow, peekGow } from "./gow-link";

const peek = (extra: Partial<GowPeek> = {}): GowPeek => ({
  groupId: "g",
  groupName: "Sunday Crew",
  week: 6,
  lockAt: "2027-10-15T00:15:00Z",
  game: { gameId: "101", away: "KC", home: "BUF", kickoff: "2027-10-18T00:20:00Z", hype: 71.5 },
  gow: null,
  state: "open",
  ...extra,
});

describe("blocked", () => {
  it("offers Confirm on an open link", () => {
    expect(blocked(peek())).toBeNull();
    expect(blocked(peek({ gow: { gameId: "999", chosenBy: "auto", chosenAt: "" } }))).toBeNull();
  });

  it("explains each state that can't confirm", () => {
    expect(blocked(peek({ state: "closed" }))).toMatch(/Week 6 has locked/);
    expect(blocked(peek({ state: "used" }))).toMatch(/already used/);
    expect(blocked(peek({ state: "canceled" }))).toMatch(/canceled/);
    expect(blocked(peek({ gow: { gameId: "101", chosenBy: "u", chosenAt: "" } }))).toMatch(/already the Game/);
  });
});

describe("public calls", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("send the token without an Authorization header", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: peek(), error: null, meta: {} })));
    vi.stubGlobal("fetch", fetch);
    await peekGow("a.b+c");
    expect(fetch.mock.calls[0][0]).toMatch(/\/gow\/peek\?t=a\.b%2Bc$/);
    expect(fetch.mock.calls[0][1].headers).not.toHaveProperty("Authorization");
  });

  it("surface the API's message", async () => {
    const body = { data: null, error: { message: "This link was already used." }, meta: {} };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 409 })));
    await expect(confirmGow("t")).rejects.toMatchObject({ status: 409, message: "This link was already used." });
  });
});
