import { afterEach, describe, expect, it, vi } from "vitest";

import { REQUIRED_ENV, assertBuildEnv } from "./env";

const VALID = {
  NEXT_PUBLIC_COGNITO_USER_POOL_ID: "us-east-1_Example",
  NEXT_PUBLIC_COGNITO_CLIENT_ID: "client",
  NEXT_PUBLIC_COGNITO_DOMAIN: "auth.example.com",
  NEXT_PUBLIC_API_URL: "https://api.example.com",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("assertBuildEnv", () => {
  it("accepts a complete env", () => {
    expect(() => assertBuildEnv(VALID)).not.toThrow();
  });

  it.each(REQUIRED_ENV)("rejects a missing or blank %s", (name) => {
    expect(() => assertBuildEnv({ ...VALID, [name]: undefined })).toThrow(`${name} is not set`);
    expect(() => assertBuildEnv({ ...VALID, [name]: "  " })).toThrow(`${name} is not set`);
  });

  it("lists every missing var at once", () => {
    expect(() => assertBuildEnv({})).toThrow(new RegExp(REQUIRED_ENV.join("[\\s\\S]*")));
  });

  it("rejects a hosted UI domain with a scheme", () => {
    expect(() => assertBuildEnv({ ...VALID, NEXT_PUBLIC_COGNITO_DOMAIN: "https://auth.example.com" })).toThrow(
      "bare host",
    );
  });
});

describe("next.config", () => {
  it("refuses to load without the Cognito env", async () => {
    for (const [name, value] of Object.entries(VALID)) vi.stubEnv(name, value);
    vi.stubEnv("NEXT_PUBLIC_COGNITO_CLIENT_ID", "");

    await expect(import("../next.config")).rejects.toThrow("NEXT_PUBLIC_COGNITO_CLIENT_ID is not set");
  });

  it("loads with a complete env", async () => {
    for (const [name, value] of Object.entries(VALID)) vi.stubEnv(name, value);

    const { default: config } = await import("../next.config");
    expect(config.output).toBe("export");
  });
});
