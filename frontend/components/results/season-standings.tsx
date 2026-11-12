"use client";

import { ArrowLeft, Trophy } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { FieldTitle } from "@/components/field/field-title";
import { LoadError } from "@/components/load-error";
import { buttonVariants } from "@/components/ui/button";
import { type SeasonStandings, getGroup, getSeasonStandings } from "@/lib/api/client";
import { useLoad } from "@/lib/api/use-load";
import { groupHref } from "@/lib/groups";
import { standingsHref } from "@/lib/results";
import { cn } from "@/lib/utils";

export function StandingsLink({ groupId }: { groupId: string }) {
  return (
    <Link href={standingsHref(groupId)} className={buttonVariants({ variant: "outline" })}>
      <Trophy aria-hidden="true" />
      Standings
    </Link>
  );
}

export function SeasonStandingsView() {
  const id = useSearchParams().get("id") ?? "";
  const fetcher = useCallback(() => Promise.all([getGroup(id), getSeasonStandings(id)]), [id]);
  const { load, retry } = useLoad(fetcher);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6" aria-busy={load.status === "loading"}>
      <Link href={groupHref(id)} className="chalk inline-flex min-h-11 items-center gap-1.5 text-sm tracking-[0.14em] hover:text-primary">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to group
      </Link>
      {load.status === "loading" && (
        <div className="mt-2 animate-pulse space-y-3">
          <span className="block h-12 w-56 rounded bg-card/70" />
          <span className="block h-72 rounded-lg bg-board" />
          <span className="sr-only">Loading standings</span>
        </div>
      )}
      {load.status === "error" && <LoadError title="Couldn't load the standings" message={load.message} onRetry={retry} />}
      {load.status === "ready" && (
        <>
          <FieldTitle sub={`${load.data[0].group.name} · ${load.data[0].group.season} season`} className="mt-1">
            Standings
          </FieldTitle>
          <SeasonTable standings={load.data[1]} />
        </>
      )}
    </div>
  );
}

const NUM = "px-2 py-2 text-right";

function SeasonTable({ standings }: { standings: SeasonStandings }) {
  if (standings.rows.length === 0) {
    return (
      <p role="status" className="panel mt-6 p-4 text-sm text-muted-foreground">
        The season table fills in once Week 1 is graded.
      </p>
    );
  }
  const weeks = Array.from({ length: standings.throughWeek }, (_, i) => String(i + 1));

  return (
    <section className="scoreboard mt-6 p-3" aria-labelledby="season-title">
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 id="season-title" className="led text-xl">
          THRU WEEK {standings.throughWeek}
        </h2>
        <span
          className={cn(
            "rounded-sm border-2 px-2 py-0.5 font-display text-xs font-extrabold tracking-[0.18em]",
            standings.final ? "border-correct/70 text-correct" : "border-flag/80 text-flag",
          )}
        >
          {standings.final ? "FINAL" : "PROVISIONAL"}
        </span>
      </div>
      <p className="mt-1 px-1 text-xs text-muted-foreground">
        Season entries only. GOW points break a tie on the total. Scroll sideways for each week.
      </p>
      {/* Scrolls inside its box, so the page never scrolls sideways on a phone. */}
      <div className="relative mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label="Season standings by week">
        <table className="w-full border-separate border-spacing-y-0.5 text-sm">
          <thead>
            <tr className="font-display text-xs tracking-[0.14em] text-muted-foreground uppercase">
              <th scope="col" className="sticky left-0 z-[1] bg-board px-2 py-1 text-left">
                Player
              </th>
              <th scope="col" className={NUM}>
                Total
              </th>
              <th scope="col" className={NUM}>
                GOW
              </th>
              {weeks.map((w) => (
                <th key={w} scope="col" className={cn(NUM, "font-normal")}>
                  <span className="sr-only">Week </span>W{w}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {standings.rows.map((r) => (
              <tr key={r.member} className="bg-white/[0.04]">
                <th scope="row" className="sticky left-0 z-[1] rounded-l-sm bg-board px-2 py-2 text-left font-normal">
                  <span className="flex w-36 items-center gap-2 sm:w-48">
                    <span className="led w-7 shrink-0 text-base">{r.place}</span>
                    <span className="truncate font-display text-base font-bold">{r.name}</span>
                  </span>
                </th>
                <td className={NUM}>
                  <span className="led text-lg">{r.total}</span>
                </td>
                <td className={cn(NUM, "tabular-nums")}>{r.gow > 0 ? `+${r.gow}` : r.gow}</td>
                {weeks.map((w) => (
                  <td key={w} className={cn(NUM, "text-muted-foreground tabular-nums last:rounded-r-sm")}>
                    {r.weeks[w] ?? "-"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 px-1 text-xs text-muted-foreground">* shares the place.</p>
    </section>
  );
}
