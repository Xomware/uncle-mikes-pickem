"use client";

import { LoaderCircle, LogIn } from "lucide-react";
import type { ReactNode } from "react";

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { useAuth } from "@/lib/auth/use-auth";

interface AuthGuardProps {
  children: ReactNode;
}

/**
 * Renders its children only once there is a session.
 *
 * UX, not security: the bundle is public, and the API's Cognito authorizer is
 * what keeps group data private. Signed-out visitors get the sign-in prompt in
 * place, so sign-in returns them to the page they asked for.
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const auth = useAuth();

  if (auth.status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <LoaderCircle className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="sr-only" role="status">
          Checking your session
        </span>
      </div>
    );
  }

  if (auth.status === "signedOut") {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-12">
        <div className="rounded-xl border bg-card p-6">
          <LogIn className="size-6 text-primary" aria-hidden="true" />
          <h1 className="mt-3 text-2xl font-bold uppercase">Sign in to continue</h1>
          <p className="mt-2 mb-6 leading-relaxed text-muted-foreground">
            Your groups and picks are only visible to members. Sign in with the Google account you joined with.
          </p>
          <GoogleSignInButton className="[&_button]:w-full" />
        </div>
      </div>
    );
  }

  return children;
}
