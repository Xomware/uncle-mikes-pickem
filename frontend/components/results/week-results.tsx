"use client";

import { Trophy } from "lucide-react";
import { useCallback } from "react";

import { LoadError } from "@/components/load-error";
import { GroupGrid } from "@/components/picks/group-grid";
import { OrganizerTools } from "@/components/results/organizer-tools";
import { type WeekResult, type WeekView, getWeekResult, unlessMissing } from "@/lib/api/client";
import { useLoad } from "@/lib/api/use-load";
import { isOrganizer } from "@/lib/groups";
import { cn } from "@/lib/utils";

/** A locked week: the graded scoreboard, then everyone's picks marked from it. */
export function LockedWeek({ view }: { view: WeekView }) {
  const { groupId } = view.group;
  const week = view.week.week;
  const fetcher = useCallback(() => unlessMissing(getWeekResult(groupId, week)), [groupId, week]);
  const { load, retry, setData } = useLoad(fetcher);
  // Refetch in place after an organizer change, so the board doesn't drop to a skeleton.
  const refresh = async () => setData(await fetcher());

  return (
    <>
      {load.status === "loading" && (
        <div className="mt-8 h-56 animate-pulse rounded-lg bg-board">
          <span className="sr-only" role="status">
            Loading results
          </span>
        </div>
      )}
      {load.status === "error" && (
        <div className="mt-8">
          <LoadError title="Couldn't load the results" message={load.message} onRetry={retry} />
        </div>
      )}
      {load.status === "ready" && <WeekResults view={view} result={load.data} />}
      {load.status === "ready" && isOrganizer(view.role) && (
        <OrganizerTools view={view} result={load.data} onChange={refresh} />
      )}
      <GroupGrid view={view} result={load.status === "ready" ? load.data : null} />
    </>
  );
}

const NOTE: Record<WeekResult["status"], string | null> = {
  open: "Games still to play. Scores move as they go final.",
  provisional: "Every game is final. Waiting on the official stats to confirm.",
  final: null,
};

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

function WeekResults({ view, result }: { view: WeekView; result: WeekResult | null }) {
  if (!result) {
    return (
      <p role="status" className="panel mt-8 p-4 text-sm text-muted-foreground">
        Week {view.week.week} isn&apos;t graded yet. Scores post here as games go final.
      </p>
    );
  }
  const me = view.mine?.sub;
  const winners = new Set(result.winners);
  const winnerNames = result.members.filter((m) => winners.has(m.sub)).map((m) => m.name);
  const guesses = new Map(view.picks.map((p) => [p.sub, p.tiebreak]));
  const final = result.status === "final";

  return (
    <section className="mt-8" aria-labelledby="results-title">
      <h2 id="results-title" className="paint worn text-4xl leading-none">
        Results
      </h2>
      <div className="scoreboard mt-4 p-3">
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="led text-xl">WEEK {result.week}</span>
          <span
            className={cn(
              "rounded-sm border-2 px-2 py-0.5 font-display text-xs font-extrabold tracking-[0.18em]",
              final ? "border-correct/70 text-correct" : "border-flag/80 text-flag",
            )}
          >
            {final ? "FINAL" : "PROVISIONAL"}
          </span>
        </div>
        {NOTE[result.status] && <p className="mt-1 px-1 text-xs text-muted-foreground">{NOTE[result.status]}</p>}

        <p className="mt-3 flex items-start gap-2 rounded-md bg-white/[0.05] px-2 py-2 text-sm">
          <Trophy className="mt-0.5 size-4 shrink-0 text-led" aria-hidden="true" />
          {winnerNames.length > 0 ? (
            <span>
              <span className="font-display font-extrabold uppercase">{winnerNames.join(" and ")}</span>{" "}
              {winnerNames.length > 1 ? "split the weekly pot" : "wins the week"}
              <span className="text-muted-foreground"> · MNF total {result.tiebreakTotal}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">
              The weekly winner is set once every game is final. The MNF total breaks a tie.
            </span>
          )}
        </p>

        <table className="mt-2 w-full table-fixed border-separate border-spacing-y-0.5 text-sm">
          <thead>
            <tr className="font-display text-xs tracking-[0.14em] text-muted-foreground uppercase">
              <th scope="col" className="w-10 px-1 py-1 text-left">
                Pl
              </th>
              <th scope="col" className="px-1 py-1 text-left">
                Player
              </th>
              <th scope="col" className="w-11 px-1 py-1 text-right">
                Pts
              </th>
              <th scope="col" className="w-11 px-1 py-1 text-right">
                GOW
              </th>
              <th scope="col" className="w-10 px-1 py-1 text-right">
                <abbr title="Tiebreak guess" className="no-underline">
                  TB
                </abbr>
              </th>
            </tr>
          </thead>
          <tbody>
            {result.members.map((m) => (
              <tr key={m.sub} className={winners.has(m.sub) ? "bg-correct-muted" : "bg-white/[0.04]"}>
                <td className="rounded-l-sm px-1 py-1.5">
                  <span className="led text-base">{m.place}</span>
                </td>
                <th scope="row" className="px-1 py-1.5 text-left font-normal">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className={cn("truncate font-display text-base font-bold", m.sub === me && "text-primary")}>
                      {m.name}
                    </span>
                    {m.sub === me && <span className="sr-only">(you)</span>}
                    {winners.has(m.sub) && (
                      <>
                        <Trophy className="size-3.5 shrink-0 text-led" aria-hidden="true" />
                        <span className="sr-only">weekly winner</span>
                      </>
                    )}
                    {m.entryType === "weekly" && <Tag>Weekly</Tag>}
                    {m.missed && <Tag>No sheet</Tag>}
                  </span>
                </th>
                <td className="px-1 py-1.5 text-right">
                  <span className="led text-base">{m.weekly}</span>
                </td>
                <td className="px-1 py-1.5 text-right tabular-nums">{signed(m.gow)}</td>
                <td className="rounded-r-sm px-1 py-1.5 text-right text-muted-foreground tabular-nums">
                  {guesses.get(m.sub) ?? "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 px-1 text-xs text-muted-foreground">
          * shares the place. GOW is what the Primetime pick adds to the yearly table.
        </p>
      </div>
    </section>
  );
}

function Tag({ children }: { children: string }) {
  return (
    <span className="shrink-0 rounded-sm border border-white/15 px-1 text-[0.6rem] font-semibold tracking-wider text-muted-foreground uppercase">
      {children}
    </span>
  );
}
