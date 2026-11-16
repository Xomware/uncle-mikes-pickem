import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchAuthSession } = vi.hoisted(() => ({ fetchAuthSession: vi.fn() }));
vi.mock("aws-amplify/auth", () => ({ fetchAuthSession }));

import { FLAG_DEFAULTS, isSuperAdmin, loadFlags, resetFlagCache } from "./flags";

function respond(...replies: [number, unknown][]) {
  const fetchMock = vi.fn(async () => {
    const [status, body] = replies.shift() ?? [500, {}];
    return new Response(JSON.stringify(body), { status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const ok = (data: unknown) => [200, { data, error: null, meta: null }] as [number, unknown];
const notFound = [404, { data: null, error: { message: "Not found" }, meta: null }] as [number, unknown];

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.test");
  fetchAuthSession.mockResolvedValue({ tokens: { idToken: { toString: () => "id-token" } } });
});

afterEach(() => {
  resetFlagCache();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("flags", () => {
  it("fetches each group's flags once", async () => {
    const off = { ...FLAG_DEFAULTS, deathPool: false };
    const fetchMock = respond(ok(off));
    await expect(loadFlags("g1")).resolves.toEqual(off);
    await expect(loadFlags("g1")).resolves.toEqual(off);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]).toEqual(["https://api.test/config/flags?groupId=g1", expect.anything()]);
  });

  it("falls back to the defaults on an error and retries next time", async () => {
    const fetchMock = respond([500, {}], ok({ ...FLAG_DEFAULTS, payments: false }));
    await expect(loadFlags()).resolves.toEqual(FLAG_DEFAULTS);
    await expect(loadFlags()).resolves.toMatchObject({ payments: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("isSuperAdmin", () => {
  it("is true on a 200 and remembers it", async () => {
    const fetchMock = respond(ok({ groups: 0 }));
    await expect(isSuperAdmin()).resolves.toBe(true);
    await expect(isSuperAdmin()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("remembers a 404 but asks again after any other failure", async () => {
    const fetchMock = respond([503, {}], notFound);
    await expect(isSuperAdmin()).resolves.toBe(false);
    await expect(isSuperAdmin()).resolves.toBe(false);
    await expect(isSuperAdmin()).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
