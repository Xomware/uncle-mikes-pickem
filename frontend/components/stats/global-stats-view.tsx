"use client";

import Link from "next/link";
import { useState } from "react";

import { FieldTitle } from "@/components/field/field-title";
import { Board, Stat } from "@/components/field/stat";
import { TeamLogo } from "@/components/field/team-logo";
import { LoadError } from "@/components/load-error";
import { type GlobalStats, type TeamTotal, getGlobalStats } from "@/lib/api/client";
import { useLoad } from "@/lib/api/use-load";
import { type TeamSort, avgPoints, rightPct, sortTeams } from "@/lib/global-stats";
import { teamHref } from "@/lib/teams";
import { cn } from "@/lib/utils";

const NUM = "px-2 py-1.5 text-right whitespace-nowrap tabular-nums";
const HEAD = "font-display text-xs tracking-[0.14em] text-muted-foreground uppercase";

export function GlobalStatsView() {
  const { load, retry } = useLoad(getGlobalStats);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:max-w-6xl" aria-busy={load.status === "loading"}>
      {load.status === "loading" && (
        <div className="animate-pulse space-y-3">
          <span className="block h-12 w-56 rounded bg-card/70" />
          <span className="block h-40 rounded-lg bg-board" />
          <span className="block h-72 rounded-lg bg-board" />
          <span className="sr-only">Loading the stats</span>
        </div>
      )}
      {load.status === "error" && <LoadError title="Couldn't load the stats" message={load.message} onRetry={retry} />}
      {load.status === "ready" && <Stats data={load.data} />}
    </div>
  );
}

function Stats({ data }: { data: GlobalStats | null }) {
  if (!data || data.weeks.length === 0) {
    return (
      <>
        <FieldTitle sub="Every group, every pick">Stats</FieldTitle>
        <p role="status" className="panel mt-6 p-4 text-sm text-muted-foreground">
          The stats fill in once Week 1 is graded.
        </p>
      </>
    );
  }

  const graded = data.accuracy.correct + data.accuracy.wrong + data.accuracy.ties;
  return (
    <>
      <FieldTitle sub={`${data.season} season · every group`}>Stats</FieldTitle>
      <Link href="/leaderboard/" className="chalk mt-3 inline-block text-xs underline-offset-4 hover:underline">
        &larr; Back to leaders
      </Link>

      <section className="scoreboard mt-4 p-4 sm:p-5" aria-labelledby="app-pct">
        <p id="app-pct" className="font-display text-xs tracking-[0.2em] text-muted-foreground uppercase">
          App pick %
        </p>
        <p className="led text-6xl leading-none sm:text-7xl">{rightPct(data.accuracy)}</p>
        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Picks graded" value={graded.toLocaleString()} />
          <Stat label="Right" value={data.accuracy.correct.toLocaleString()} />
          <Stat label="Players" value={String(data.players)} />
          <Stat label="Groups" value={String(data.groups.length)} />
        </dl>
        <WeekBars weeks={data.weeks} />
      </section>

      {/* Wide: teams run down the right; groups and upsets stack on the left, the spare height under the upsets. */}
      <div className="mt-6 space-y-6 lg:grid lg:grid-cols-2 lg:grid-rows-[auto_1fr] lg:items-start lg:gap-6 lg:space-y-0">
        <Board title="Groups">
          <GroupTable data={data} />
        </Board>
        <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <Board title="Teams">
            <TeamTable teams={data.teams} />
          </Board>
        </div>
        {data.upsets.length > 0 && (
          <Board title="Biggest upsets">
            <Upsets data={data} />
          </Board>
        )}
      </div>
      <ul className="panel mt-6 space-y-1 p-3 text-xs text-muted-foreground">
        <li>Every sheet in every group counts, so a player in two groups counts twice.</li>
        <li>Only decided picks count: pending and canceled games don&apos;t.</li>
        <li>A group is named only if you&apos;re in it.</li>
      </ul>
    </>
  );
}

function WeekBars({ weeks }: { weeks: GlobalStats["weeks"] }) {
  return (
    <div className="mt-4">
      <p className={HEAD}>Pick % by week</p>
      <div className="mt-2 overflow-x-auto" tabIndex={0} role="region" aria-label="Pick % by week">
        <ol className="flex h-28 min-w-max items-end gap-1.5 lg:min-w-0">
          {weeks.map((w) => {
            const n = w.correct + w.wrong + w.ties;
            const pct = n ? w.correct / n : 0;
            return (
              <li key={w.week} className="flex h-full w-6 flex-col sm:w-8 items-center justify-end gap-1 lg:w-auto lg:max-w-16 lg:flex-1">
                <span className="led text-[0.65rem]">{n ? Math.round(pct * 100) : "-"}</span>
                <span
                  aria-hidden="true"
                  className="w-full rounded-t-sm bg-led/80 shadow-[0_0_6px_var(--led)]"
                  style={{ height: `${Math.max(pct * 70, 2)}%` }}
                />
                <span className="text-[0.65rem] text-muted-foreground">W{w.week}</span>
                <span className="sr-only">{`Week ${w.week}: ${rightPct(w)} of ${n} picks right`}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function GroupTable({ data }: { data: GlobalStats }) {
  return (
    <div className="mt-2 overflow-x-auto" tabIndex={0} role="region" aria-label="Groups ranked">
      <table className="w-full border-separate border-spacing-y-0.5 text-sm">
        <thead>
          <tr className={HEAD}>
            <th scope="col" className="px-2 py-1 text-left">
              Group
            </th>
            <th scope="col" className={NUM}>
              Players
            </th>
            <th scope="col" className={NUM}>
              <abbr title="Average confidence points per sheet" className="no-underline">
                Avg pts
              </abbr>
            </th>
          </tr>
        </thead>
        <tbody>
          {data.groups.map((g, i) => (
            <tr key={i} className={g.name ? "bg-primary/15" : "bg-white/[0.04]"}>
              <th scope="row" className="rounded-l-sm px-2 py-1.5 text-left font-normal">
                <span className="flex items-center gap-2">
                  <span className="led w-7 shrink-0 text-base">{g.rank}</span>
                  <span
                    className={cn(
                      "max-w-28 truncate font-display text-base font-bold sm:max-w-md",
                      !g.name && "text-muted-foreground",
                    )}
                  >
                    {g.name ?? "Another group"}
                  </span>
                </span>
              </th>
              <td className={NUM}>{g.players}</td>
              <td className={cn(NUM, "rounded-r-sm")}>
                <span className="led text-lg">{avgPoints(g)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 px-1 text-xs text-muted-foreground">
        Ranked by confidence points per sheet turned in, Weeks 1-{data.week}.
      </p>
    </div>
  );
}

const SORTS: { key: TeamSort; label: string }[] = [
  { key: "picks", label: "Most picked" },
  { key: "points", label: "Most points" },
  { key: "pct", label: "Best %" },
];

function TeamTable({ teams }: { teams: TeamTotal[] }) {
  const [by, setBy] = useState<TeamSort>("picks");
  return (
    <>
      <div role="group" aria-label="Sort teams" className="mt-2 flex flex-wrap gap-1">
        {SORTS.map((s) => (
          <button
            key={s.key}
            type="button"
            aria-pressed={by === s.key}
            onClick={() => setBy(s.key)}
            className={cn(
              "h-9 rounded-md px-3 font-display text-sm font-extrabold tracking-wide uppercase outline-none focus-visible:ring-3 focus-visible:ring-ring/60",
              by === s.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="mt-2 overflow-x-auto" tabIndex={0} role="region" aria-label="Team totals">
        <table className="w-full text-sm">
          <thead>
            <tr className={HEAD}>
              <th scope="col" className="px-2 py-1 text-left">
                Team
              </th>
              <th scope="col" className={NUM}>
                Picks
              </th>
              <th scope="col" className={NUM}>
                Right %
              </th>
              <th scope="col" className={NUM}>
                <abbr title="Confidence points won" className="no-underline">
                  Pts
                </abbr>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortTeams(teams, by).map((t) => (
              <tr key={t.team} className="relative border-t border-white/5 hover:bg-white/5 has-focus-visible:bg-white/5">
                <td className="px-2 py-1">
                  <Link
                    href={teamHref(t.team)}
                    className="flex min-h-9 items-center gap-2 outline-none after:absolute after:inset-0 focus-visible:after:rounded-sm focus-visible:after:ring-2 focus-visible:after:ring-ring/60 focus-visible:after:ring-inset"
                  >
                    <TeamLogo abbr={t.team} className="size-7" />
                    <span className="font-display text-lg leading-none font-extrabold">{t.team}</span>
                  </Link>
                </td>
                <td className={NUM}>{t.picks}</td>
                <td className={NUM}>
                  <span className="led text-base">{rightPct(t)}</span>
                </td>
                <td className={NUM}>{t.points.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Upsets({ data }: { data: GlobalStats }) {
  return (
    <ol className="mt-2 space-y-1.5">
      {data.upsets.map((u) => (
        <li key={`${u.week}-${u.gameId}`} className="flex items-center gap-3 rounded-md bg-white/[0.04] px-2 py-2">
          <span className="w-9 shrink-0 font-display text-xs tracking-wider text-muted-foreground uppercase">
            W{u.week}
          </span>
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="flex items-center gap-1.5">
              <TeamLogo abbr={u.winner} />
              <span className="font-display font-extrabold">{u.winner}</span>
              <span className="led text-base">{u.winnerScore}</span>
            </span>
            <span className="text-xs text-muted-foreground">beat</span>
            <span className="flex items-center gap-1.5">
              <TeamLogo abbr={u.loser} />
              <span className="font-display font-extrabold">{u.loser}</span>
              <span className="led text-base opacity-60">{u.loserScore}</span>
            </span>
          </span>
          <span className="shrink-0 text-right">
            <span className="led block text-xl leading-none">{Math.round((100 * u.onLoser) / u.picks)}%</span>
            <span className="text-[0.65rem] text-muted-foreground">picked {u.loser}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
