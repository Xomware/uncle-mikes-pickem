// Plain module, no "use client": next.config.ts imports it in Node.

export const REQUIRED_ENV = [
  "NEXT_PUBLIC_COGNITO_USER_POOL_ID",
  "NEXT_PUBLIC_COGNITO_CLIENT_ID",
  "NEXT_PUBLIC_COGNITO_DOMAIN",
  "NEXT_PUBLIC_API_URL",
] as const;

/**
 * Throws unless every required public env var is set.
 *
 * NEXT_PUBLIC_ values are inlined at build time, so a build without them ships
 * a bundle with no way to sign in and no API to call. Failing here is the only
 * point where that is still loud.
 */
export function assertBuildEnv(env: Record<string, string | undefined>): void {
  const problems: string[] = REQUIRED_ENV.filter((name) => !env[name]?.trim()).map((name) => `${name} is not set`);

  // Amplify builds https://<domain>/oauth2/authorize itself; a scheme here becomes https://https://.
  if (env.NEXT_PUBLIC_COGNITO_DOMAIN?.includes("://")) {
    problems.push("NEXT_PUBLIC_COGNITO_DOMAIN must be a bare host, without https://");
  }

  if (problems.length) {
    throw new Error(`Missing or invalid build env (see frontend/README.md):\n  ${problems.join("\n  ")}`);
  }
}
