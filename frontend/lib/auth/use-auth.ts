"use client";

import { fetchAuthSession, signInWithRedirect, signOut as amplifySignOut } from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";
import { useCallback, useEffect, useState } from "react";

import "./amplify";
import { rememberNextPath } from "./next-path";

export type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; email: string | null; name: string | null };

async function resolveAuth(): Promise<AuthState> {
  // fetchAuthSession resolves with no tokens when signed out; it rejects only
  // when a stored refresh token is dead, which is also signed out.
  const session = await fetchAuthSession().catch(() => null);
  const claims = session?.tokens?.idToken?.payload;
  if (!claims) return { status: "signedOut" };
  return {
    status: "signedIn",
    email: typeof claims.email === "string" ? claims.email : null,
    name: typeof claims.name === "string" ? claims.name : null,
  };
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  const refresh = useCallback(async () => setState(await resolveAuth()), []);

  useEffect(() => {
    let cancelled = false;
    const update = async () => {
      const next = await resolveAuth();
      if (!cancelled) setState(next);
    };
    void update();

    // The Google round trip completes outside React; Hub is how mounted components hear about it.
    const stop = Hub.listen("auth", ({ payload }) => {
      if (["signInWithRedirect", "signedIn", "signedOut", "tokenRefresh"].includes(payload.event)) void update();
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  const signInWithGoogle = useCallback(async (nextPath?: string) => {
    rememberNextPath(nextPath ?? `${window.location.pathname}${window.location.search}`);
    await signInWithRedirect({ provider: "Google" });
  }, []);

  // With oauth configured this also ends the Hosted UI session and redirects to the site root.
  const signOut = useCallback(() => amplifySignOut(), []);

  return { ...state, refresh, signInWithGoogle, signOut };
}
