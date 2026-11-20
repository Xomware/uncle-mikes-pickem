"use client";

import { CircleAlert, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { EmailPrefs } from "@/components/profile/email-prefs";
import { MyStatsSection } from "@/components/profile/my-stats";
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
    <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-x-6 px-4 py-8 sm:px-6 lg:grid-cols-3 lg:grid-rows-[auto_auto_1fr] lg:items-start">
      <h1 className="paint worn mt-1 text-5xl leading-none sm:text-6xl lg:col-span-3">Profile</h1>
      <section aria-live="polite" aria-busy={load.status === "loading"} className="mt-6 panel p-5 lg:col-start-1">
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
      <div className="mt-8 min-w-0 lg:col-span-2 lg:col-start-2 lg:row-span-2 lg:row-start-2 lg:mt-6">
        <MyStatsSection />
      </div>
      <div className="min-w-0 lg:col-start-1">
        <EmailPrefs />
      </div>
    </div>
  );
}

function ProfileDetails({ profile }: { profile: Profile }) {
  const initial = (profile.name || profile.email).trim().charAt(0).toUpperCase();
  return (
    <div className="flex items-center gap-4">
      <span
        aria-hidden="true"
        className="flex size-14 shrink-0 items-center justify-center rounded-md bg-turf font-stencil text-3xl font-black text-chalk shadow-[inset_0_-3px_0_var(--chalk)]"
      >
        {initial}
      </span>
      <dl className="min-w-0">
        <dt className="sr-only">Name</dt>
        <dd className="truncate font-display text-2xl font-extrabold uppercase">{profile.name ?? "No name set"}</dd>
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
