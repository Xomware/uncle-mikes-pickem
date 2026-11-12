import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchAuthSession } = vi.hoisted(() => ({ fetchAuthSession: vi.fn() }));
vi.mock("aws-amplify/auth", () => ({ fetchAuthSession }));

import { ApiError, getProfile } from "./client";

function respond(status: number, body: unknown) {
  const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
    async () => new Response(JSON.stringify(body), { status }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.test");
  fetchAuthSession.mockResolvedValue({
    tokens: {
      idToken: { toString: () => "id-token", payload: { sub: "u1" } },
      accessToken: { toString: () => "access-token" },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  fetchAuthSession.mockReset();
});

describe("api client", () => {
  it("sends the ID token, not the access token, and unwraps the envelope", async () => {
    const profile = { sub: "u1", email: "viewer@example.com", name: "Viewer" };
    const fetchMock = respond(200, { data: profile, error: null, meta: null });

    await expect(getProfile()).resolves.toEqual(profile);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.test/me/profile");
    expect(new Headers(init.headers).get("Authorization")).toBe("id-token");
  });

  it("does not call the API when signed out", async () => {
    fetchAuthSession.mockResolvedValue({ tokens: undefined });
    const fetchMock = respond(200, {});

    await expect(getProfile()).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws the envelope error", async () => {
    respond(500, { data: null, error: { message: "Internal error" }, meta: null });

    const err = await getProfile().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 500, message: "Internal error" });
  });

  it("throws on an authorizer rejection, which is not an envelope", async () => {
    respond(401, { message: "Unauthorized" });

    await expect(getProfile()).rejects.toMatchObject({ status: 401, message: "Request failed (401)" });
  });
});
