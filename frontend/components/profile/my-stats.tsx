"use client";

import Link from "next/link";
import { useCallback, useId, useState } from "react";

import { Board, Stat } from "@/components/field/stat";
import { TeamLogo } from "@/components/field/team-logo";
import { Loaded } from "@/components/loaded";
import { Select } from "@/components/ui/input";
import { pct } from "@/lib/analytics";
import { type GroupSummary, type MyStats, getMyStats, myGroups } from "@/lib/api/client";
import { useLoad } from "@/lib/api/use-load";
import { groupHref } from "@/lib/groups";
import { STATUS_LABEL, cents } from "@/lib/payouts";
import { finishes, ordinal, pickRate, recordText, teamTrends } from "@/lib/stats";
import { cn } from "@/lib/utils";

/** Your season in each of your groups, one group at a time. */
export function MyStatsSection() {
  const { load, retry } = useLoad(myGroups);
  return (
    <section aria-labelledby="stats-heading">
      <h2 id="stats-heading" className="paint worn text-4xl leading-none">
        Your stats
      </h2>
      <div className="mt-3">
        <Loaded load={load} retry={retry} what="your groups" height="h-64">
          {(groups) =>
            groups.length ? (
              <GroupStats groups={groups} />
            ) : (
              <p className="panel p-4 text-sm text-muted-foreground">
                Join a group and your pick record shows up here once its first week is graded.
              </p>
            )
          }
        </Loaded>
      </div>
    </section>
  );
}

function GroupStats({ groups }: { groups: GroupSummary[] }) {
  const selectId = useId();
  const [groupId, setGroupId] = useState(groups[0].groupId);
  const fetcher = useCallback(() => getMyStats(groupId), [groupId]);
  const { load, retry } = useLoad(fetcher);

  return (
    <>
      {groups.length > 1 && (
        <div className="mb-3 flex items-center gap-3">
          <label htmlFor={selectId} className="chalk shrink-0 text-xs tracking-[0.14em]">
            Group
          </label>
          <Select id={selectId} value={groupId} onChange={(e) => setGroupId(e.target.value)} className="sm:max-w-sm">
            {groups.map((g) => (
              <option key={g.groupId} value={g.groupId}>
                {g.name} · {g.season}
              </option>
            ))}
          </Select>
        </div>
      )}
      <div aria-live="polite">
        <Loaded load={load} retry={retry} what="your stats" height="h-96">
          {(stats) => <StatsBody stats={stats} />}
        </Loaded>
      </div>
    </>
  );
}

/** A player's season in one group: the scoreboard, weekly finishes, team trends and confidence chart. */
export function StatsBody({ stats }: { stats: MyStats }) {
  const { group, record, points, streak, gow, season, money } = stats;
  if (!stats.weeks.length) {
    if (!stats.you || !group) {
      return <p className="panel p-4 text-sm text-muted-foreground">No graded weeks yet this season.</p>;
    }
    return (
      <p className="panel p-4 text-sm text-muted-foreground">
        Your stats for{" "}
        <Link href={groupHref(group.groupId)} className="font-semibold text-foreground underline underline-offset-4 hover:text-primary">
          {group.name}
        </Link>{" "}
        start once Week 1 is graded.
      </p>
    );
  }
  const rate = pickRate(record);
  const place = finishes(stats.weeks);
  const won = stats.weeks.filter((w) => w.won).length;
  const played = stats.weeks.filter((w) => !w.missed);

  return (
    <div className="@container space-y-6">
      <Board
        title={group?.name ?? "Season"}
        link={<span className="shrink-0 text-xs tracking-wider text-muted-foreground uppercase">Thru Wk {stats.throughWeek}</span>}
      >
        <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 @4xl:grid-cols-8">
          <Stat label="Pick rate" value={rate === null ? "-" : pct(rate)} note={recordText(record)} />
          <Stat
            label="Points"
            value={`${points.earned}`}
            note={points.possible ? `of ${points.possible} · ${pct(points.earned / points.possible)}` : "None decided"}
          />
          <Stat
            label="Season place"
            value={season ? ordinal(season.place) : "-"}
            note={season ? `${season.total} pts` : stats.entryType === "weekly" ? "Weekly entry" : "Not ranked yet"}
          />
          <Stat label="Weeks won" value={`${won}`} note={`of ${stats.weeks.length} graded`} />
          <Stat label="Longest streak" value={`${streak.longest}`} note={`${streak.current} right in a row now`} />
          <Stat label="GOW record" value={recordText(gow)} note={season ? `${season.gow} GOW pts` : "Game of the week"} />
          <Stat
            label="Best finish"
            value={place ? ordinal(place.best) : "-"}
            note={place ? `Avg ${place.average.toFixed(1)}` : undefined}
          />
          {stats.you ? (
            <Stat
              label="Money won"
              value={money ? cents(money.won) : "-"}
              note={money ? (money.pending ? `+${cents(money.pending)} pending` : "Settled") : "Payouts off"}
            />
          ) : (
            <Stat
              label="Avg week"
              value={played.length ? (played.reduce((a, w) => a + w.weekly, 0) / played.length).toFixed(1) : "-"}
              note={`${played.length} sheets in`}
            />
          )}
        </dl>
      </Board>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <WeeklyFinishes weeks={stats.weeks} />
        <TeamTrends teams={stats.teams} you={stats.you} />
      </div>
      <ConfidenceChart levels={stats.confidence} />
    </div>
  );
}

function WeeklyFinishes({ weeks }: { weeks: MyStats["weeks"] }) {
  return (
    <section className="panel p-4" aria-labelledby="finishes-heading">
      <h3 id="finishes-heading" className="font-display text-xl font-extrabold uppercase">
        Weekly finishes
      </h3>
      <table className="mt-2 w-full text-sm">
        <thead className="text-xs text-muted-foreground uppercase">
          <tr>
            <th scope="col" className="py-1 text-left font-normal">
              Wk
            </th>
            <th scope="col" className="py-1 text-right font-normal">
              Pts
            </th>
            <th scope="col" className="py-1 text-right font-normal">
              Place
            </th>
            <th scope="col" className="py-1 pl-3 text-left font-normal">
              <span className="sr-only">Result</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {[...weeks].reverse().map((w) => (
            <tr key={w.week} className="border-t">
              <td className="py-1.5 font-display font-bold">{w.week}</td>
              <td className="py-1.5 text-right tabular-nums">{w.weekly}</td>
              <td className="py-1.5 text-right tabular-nums">
                {ordinal(w.place)} <span className="text-muted-foreground">/ {w.field}</span>
              </td>
              <td
                className={cn(
                  "py-1.5 pl-3 text-xs font-semibold uppercase",
                  w.won ? "text-correct" : w.missed ? "text-wrong" : "text-muted-foreground",
                )}
              >
                {w.won ? "Won" : w.missed ? "Missed" : w.status === "final" ? "" : STATUS_LABEL[w.status]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function TeamTrends({ teams, you }: { teams: MyStats["teams"]; you: boolean }) {
  const { paid, cost } = teamTrends(teams);
  return (
    <section className="panel p-4" aria-labelledby="teams-heading">
      <h3 id="teams-heading" className="font-display text-xl font-extrabold uppercase">
        Team trends
      </h3>
      <p className="text-xs text-muted-foreground">Confidence points won and lost on the teams picked.</p>
      <div className="mt-3 space-y-4">
        <TeamList title="Paid off" teams={paid} points={(t) => `+${t.won}`} tone="text-correct" empty="No right picks yet." />
        <TeamList title={you ? "Cost you" : "Cost them"} teams={cost} points={(t) => `-${t.lost}`} tone="text-wrong" empty="No wrong picks yet." />
      </div>
    </section>
  );
}

interface TeamListProps {
  title: string;
  teams: MyStats["teams"];
  points: (t: MyStats["teams"][number]) => string;
  tone: string;
  empty: string;
}

function TeamList({ title, teams, points, tone, empty }: TeamListProps) {
  return (
    <div>
      <h4 className="chalk text-xs tracking-[0.14em]">{title}</h4>
      {teams.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-1 divide-y">
          {teams.map((t) => (
            <li key={t.team} className="flex items-center gap-2 py-1.5">
              <TeamLogo abbr={t.team} className="size-6" />
              <span className="font-display font-bold">{t.team}</span>
              <span className="ml-auto text-sm text-muted-foreground tabular-nums">{recordText(t)}</span>
              <span className={cn("led w-14 text-right text-base", tone)}>
                {points(t)}
                <span className="sr-only"> points</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ConfidenceChart({ levels }: { levels: MyStats["confidence"] }) {
  return (
    <section className="panel p-4" aria-labelledby="confidence-heading">
      <h3 id="confidence-heading" className="font-display text-xl font-extrabold uppercase">
        Accuracy by confidence
      </h3>
      <p className="text-xs text-muted-foreground">Share of picks right at each confidence level.</p>
      <ol className="mt-3 flex h-40 items-end gap-1">
        {levels.map((c) => {
          const rate = pickRate(c) ?? 0;
          return (
            <li key={c.conf} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1">
              <span className="hidden text-[0.65rem] text-muted-foreground tabular-nums sm:block">{pct(rate)}</span>
              <span className="flex w-full flex-1 items-end rounded-sm bg-white/5" aria-hidden="true">
                <span
                  className={cn("w-full rounded-sm", rate >= 0.5 ? "bg-correct" : "bg-wrong")}
                  style={{ height: `${Math.max(rate * 100, 2)}%` }}
                />
              </span>
              <span className="font-display text-xs font-bold tabular-nums">{c.conf}</span>
              <span className="sr-only">
                -point picks: {recordText(c)}, {pct(rate)} right
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
