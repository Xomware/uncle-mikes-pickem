"use client";

import { ArrowLeft, ChevronLeft, ChevronRight, Lock, Printer, Timer } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { LoadError } from "@/components/load-error";
import { GroupGrid } from "@/components/picks/group-grid";
import { PickSheet } from "@/components/picks/pick-sheet";
import { buttonVariants } from "@/components/ui/button";
import { type WeekView, getWeek } from "@/lib/api/client";
import { useLoad } from "@/lib/api/use-load";
import { groupHref } from "@/lib/groups";
import { countdown, picksHref } from "@/lib/picks";
import { sheetHref } from "@/lib/sheet";
import { cn } from "@/lib/utils";

const LAST_WEEK = 18;

export function PicksWeek() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const week = Number(params.get("week")) || undefined;
  const fetcher = useCallback(() => getWeek(id, week), [id, week]);
  const { load, retry } = useLoad(fetcher);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6" aria-busy={load.status === "loading"}>
      <Link href={groupHref(id)} className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to group
      </Link>
      {load.status === "loading" && (
        <div className="mt-2 animate-pulse space-y-3">
          <span className="block h-10 w-40 rounded bg-muted" />
          <span className="block h-28 rounded-xl bg-muted" />
          <span className="block h-28 rounded-xl bg-muted" />
          <span className="sr-only">Loading picks</span>
        </div>
      )}
      {load.status === "error" && <LoadError title="Couldn't load this week" message={load.message} onRetry={retry} />}
      {/* Keyed on the week so moving between weeks starts a fresh sheet. */}
      {load.status === "ready" && <WeekBody key={load.data.week.week} view={load.data} reload={retry} />}
    </div>
  );
}

function WeekBody({ view, reload }: { view: WeekView; reload: () => void }) {
  const { group, week } = view;
  const left = useCountdown(week.lockAt, week.now);
  const locked = week.locked || left === null;

  return (
    <>
      <div className="mt-1 flex items-center gap-2">
        <h1 className="mr-auto text-4xl font-bold uppercase">Week {week.week}</h1>
        <WeekLink groupId={group.groupId} week={week.week - 1} label="Previous week" />
        <WeekLink groupId={group.groupId} week={week.week + 1} label="Next week" />
      </div>
      <p className="truncate text-muted-foreground">{group.name}</p>
      <Link
        href={sheetHref(group.groupId, week.week)}
        className="inline-flex min-h-11 items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
      >
        <Printer className="size-4" aria-hidden="true" />
        Printable sheet
      </Link>

      <p
        role="status"
        className={cn(
          "mt-4 flex items-center gap-2 rounded-lg border p-3 text-sm",
          locked ? "text-muted-foreground" : "border-primary/40 bg-primary/10",
        )}
      >
        {locked ? <Lock className="size-4 shrink-0" aria-hidden="true" /> : <Timer className="size-4 shrink-0 text-primary" aria-hidden="true" />}
        {locked ? (
          "Picks are locked. Everyone's picks are visible."
        ) : (
          <span>
            Locks in <strong className="font-semibold tabular-nums">{left}</strong>, at{" "}
            {new Date(week.lockAt).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}
          </span>
        )}
      </p>
      {week.locked !== locked && (
        <button type="button" onClick={reload} className="mt-2 min-h-11 text-sm text-primary underline-offset-4 hover:underline">
          Reload to see the group&apos;s picks
        </button>
      )}

      {week.locked ? <GroupGrid view={view} /> : <PickSheet view={view} locked={locked} reload={reload} />}
    </>
  );
}

function WeekLink({ groupId, week, label }: { groupId: string; week: number; label: string }) {
  const Icon = label.startsWith("Previous") ? ChevronLeft : ChevronRight;
  if (week < 1 || week > LAST_WEEK) {
    return (
      <span aria-hidden="true" className={cn(buttonVariants({ variant: "outline", size: "default" }), "w-11 px-0 opacity-40")}>
        <Icon />
      </span>
    );
  }
  return (
    <Link href={picksHref(groupId, week)} aria-label={label} className={cn(buttonVariants({ variant: "outline" }), "w-11 px-0")}>
      <Icon aria-hidden="true" />
    </Link>
  );
}

/** Time left to lock, ticking each second on the server's clock (a replay group's virtual one). */
function useCountdown(lockAt: string, serverNow: string): string | null {
  const [skew] = useState(() => Date.parse(serverNow) - Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return countdown(Date.parse(lockAt) - (now + skew));
}
