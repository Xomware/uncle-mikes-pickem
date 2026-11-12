"use client";

import { CircleAlert, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { EmailPrefs } from "@/components/profile/email-prefs";
import { Button } from "@/components/ui/button";
import { getProfile, type Profile } from "@/lib/api/client";

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; profile: Profile };

export function ProfileView() {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getProfile().then(
      (profile) => !cancelled && setLoad({ status: "ready", profile }),
      (err: unknown) =>
        !cancelled &&
        setLoad({ status: "error", message: err instanceof Error ? err.message : "Could not load your profile." }),
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  function retry() {
    setLoad({ status: "loading" });
    setAttempt((n) => n + 1);
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="text-4xl font-bold uppercase">Profile</h1>
      <section aria-live="polite" aria-busy={load.status === "loading"} className="mt-6 rounded-xl border bg-card p-5">
        {load.status === "loading" && <ProfileSkeleton />}
        {load.status === "error" && (
          <div role="alert">
            <p className="flex items-center gap-2 font-semibold text-wrong">
              <CircleAlert className="size-5" aria-hidden="true" />
              Couldn&apos;t load your profile
            </p>
            <p className="mt-1 text-muted-foreground">{load.message}</p>
            <Button variant="outline" className="mt-4" onClick={retry}>
              <RefreshCw aria-hidden="true" />
              Try again
            </Button>
          </div>
        )}
        {load.status === "ready" && <ProfileDetails profile={load.profile} />}
      </section>
      <EmailPrefs />
    </div>
  );
}

function ProfileDetails({ profile }: { profile: Profile }) {
  const initial = (profile.name || profile.email).trim().charAt(0).toUpperCase();
  return (
    <div className="flex items-center gap-4">
      <span
        aria-hidden="true"
        className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary font-display text-2xl font-bold text-primary-foreground"
      >
        {initial}
      </span>
      <dl className="min-w-0">
        <dt className="sr-only">Name</dt>
        <dd className="truncate text-xl font-semibold">{profile.name ?? "No name set"}</dd>
        <dt className="sr-only">Email</dt>
        <dd className="truncate text-muted-foreground">{profile.email}</dd>
      </dl>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="flex animate-pulse items-center gap-4">
      <span className="size-14 rounded-full bg-muted" />
      <span className="flex-1 space-y-2">
        <span className="block h-5 w-40 rounded bg-muted" />
        <span className="block h-4 w-56 rounded bg-muted" />
      </span>
      <span className="sr-only">Loading your profile</span>
    </div>
  );
}
