"use client";

import { Hub } from "aws-amplify/utils";
import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { takeNextPath } from "@/lib/auth/next-path";
import { useAuth } from "@/lib/auth/use-auth";

// A Hosted UI round trip can fail without the browser reporting it (revoked
// consent, clock skew, a code already redeemed), so after this long the page
// says so instead of spinning forever.
const TIMEOUT_MS = 8000;

/** Waits for Amplify, which exchanges `?code=` on load, then returns to where sign-in began. */
export function AuthCallback() {
  const router = useRouter();
  const auth = useAuth();
  const { refresh } = auth;
  const [failed, setFailed] = useState(false);
  // Read once: a second effect run would find the path already taken.
  const nextPath = useRef<string | null>(null);

  useEffect(() => {
    const stop = Hub.listen("auth", ({ payload }) => {
      if (payload.event === "signInWithRedirect") void refresh();
      if (payload.event === "signInWithRedirect_failure") setFailed(true);
    });
    const timer = setTimeout(() => setFailed(true), TIMEOUT_MS);
    return () => {
      stop();
      clearTimeout(timer);
    };
  }, [refresh]);

  useEffect(() => {
    if (auth.status !== "signedIn") return;
    nextPath.current ??= takeNextPath();
    // replace(), not push(): the callback URL holds a spent authorization code.
    router.replace(nextPath.current);
  }, [auth.status, router]);

  if (failed && auth.status !== "signedIn") {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4">
        <div role="alert" className="panel p-6">
          <h1 className="font-stencil text-4xl leading-none font-black uppercase">That sign-in did not finish</h1>
          <p className="mt-2 leading-relaxed text-muted-foreground">
            The link may have expired, or the window sat open too long. Nothing changed on your account.
          </p>
          <Link href="/" className={buttonVariants({ variant: "outline", className: "mt-6 w-full" })}>
            Back to sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4">
      <LoaderCircle className="size-8 animate-spin text-primary" aria-hidden="true" />
      <p role="status" className="text-muted-foreground">
        Signing you in...
      </p>
    </main>
  );
}
