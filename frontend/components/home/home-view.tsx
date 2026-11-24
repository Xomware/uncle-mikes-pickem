"use client";

import { ArrowRight, Plus, UsersRound } from "lucide-react";
import Link from "next/link";
import { type CSSProperties, useCallback, useEffect, useState } from "react";

import { FieldTitle } from "@/components/field/field-title";
import { GameStatus } from "@/components/field/game-status";
import { ScoreFlash } from "@/components/field/score-flash";
import { Board, Stat } from "@/components/field/stat";
import { TeamLogo } from "@/components/field/team-logo";
import { LoadError } from "@/components/load-error";
import { buttonVariants } from "@/components/ui/button";
import { type Slate, type SlateGame, type SlateGroup, getLeaderboard, getMyStats, getSlate } from "@/lib/api/client";
import { useLoad } from "@/lib/api/use-load";
import { usePoll } from "@/lib/api/use-poll";
import { lockAt, pickStatus, scoreStrip } from "@/lib/home";
import { pickPct, record } from "@/lib/leaderboard";
import { inLiveWindow } from "@/lib/live";
import { countdown, picksHref } from "@/lib/picks";
import { ordinal } from "@/lib/stats";
import { etDate } from "@/lib/time";
import { cn } from "@/lib/utils";

export function HomeView() {
  const { load, retry, refresh } = useLoad(getSlate);
  usePoll(() => load.status === "ready" && inLiveWindow(load.data.games, Date.now()), refresh);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6" aria-busy={load.status === "loading"}>
      {load.status === "loading" && (
        <div className="animate-pulse space-y-3">
          <span className="block h-14 w-48 rounded bg-card/70" />
          <span className="block h-24 rounded-xl bg-card/70" />
          <span className="block h-56 rounded-xl bg-card/70" />
          <span className="sr-only">Loading your week</span>
        </div>
      )}
      {load.status === "error" && <LoadError title="Couldn't load this week" message={load.message} onRetry={retry} />}
      {load.status === "ready" && <HomeBody slate={load.data} />}
      <SeasonSummary />
    </div>
  );
}

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function HomeBody({ slate }: { slate: Slate }) {
  const now = useNow();
  const lock = lockAt(slate.games);
  const left = lock ? countdown(Date.parse(lock) - now) : null;
  const strip = scoreStrip(slate.games);

  return (
    <>
      <FieldTitle sub={`${slate.season} season`}>This week</FieldTitle>

      <section className="scoreboard mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2 p-4" aria-label="This week">
        <p>
          <span className="block text-xs tracking-wider text-muted-foreground uppercase">NFL week</span>
          <span className="led text-4xl leading-none">{slate.week}</span>
        </p>
        {lock && (
          <p className="text-right">
            <span className="block text-xs tracking-wider text-muted-foreground uppercase">{left ? "Picks lock in" : "Picks"}</span>
            <span className="led text-3xl leading-none">{left ?? "LOCKED"}</span>
            <span className="block text-xs text-muted-foreground">{etDate(lock)}</span>
          </p>
        )}
      </section>

      <section className="mt-6" aria-labelledby="groups-title">
        <h2 id="groups-title" className="chalk text-sm tracking-[0.16em]">
          Your groups
        </h2>
        {slate.groups.length === 0 ? (
          <NoGroups />
        ) : (
          <ul className="mt-2 grid gap-3 sm:grid-cols-2">
            {slate.groups.map((g, i) => (
              <GroupCard key={g.groupId} index={i} group={g} week={slate.week} games={slate.games.length} left={left} />
            ))}
          </ul>
        )}
      </section>

      {strip.length > 0 && (
        <section className="mt-6" aria-labelledby="scores-title">
          <h2 id="scores-title" className="chalk text-sm tracking-[0.16em]">
            Scores
          </h2>
          <ul className="mt-2 flex snap-x gap-2 overflow-x-auto pb-2">
            {strip.map((g) => (
              <ScoreChip key={g.gameId} game={g} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function NoGroups() {
  return (
    <div className="mt-2 rounded-xl border border-dashed bg-card/85 p-6 text-center">
      <UsersRound className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
      <h3 className="mt-3 font-display text-2xl font-extrabold uppercase">No groups yet</h3>
      <p className="mx-auto mt-2 max-w-sm leading-relaxed text-muted-foreground">
        Picks are made inside a group. Open an invite link from your organizer while signed in, or start your own.
      </p>
      <Link href="/groups/" className={cn(buttonVariants(), "mt-4")}>
        <Plus aria-hidden="true" />
        Create a group
      </Link>
    </div>
  );
}

interface GroupCardProps {
  index: number;
  group: SlateGroup;
  week: number;
  games: number;
  /** Time to the live lock; null once it has passed. A replay group locks on its own clock instead. */
  left: string | null;
}

function GroupCard({ index, group, week, games, left }: GroupCardProps) {
  const fetcher = useCallback(() => getMyStats(group.groupId), [group.groupId]);
  const { load } = useLoad(fetcher);
  const status = pickStatus(group, games);
  const locked = !group.replay && !left;
  const stats = load.status === "ready" ? load.data : null;
  const pending = load.status === "loading" ? "…" : "-";

  return (
    <li className="panel flex animate-rise flex-col p-4" style={{ "--i": index } as CSSProperties}>
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 truncate font-display text-2xl font-extrabold uppercase">{group.name}</h3>
        {group.replay && <span className="rounded-sm border px-1 text-[0.65rem] font-bold tracking-wider text-muted-foreground uppercase">Replay</span>}
      </div>
      <p
        className={cn(
          "mt-1 self-start rounded-md px-2 py-0.5 text-sm font-semibold",
          status.done ? "bg-correct-muted text-correct" : status.label === "Not started" ? "bg-white/[0.05] text-muted-foreground" : "bg-primary/15 text-primary",
        )}
      >
        <span className="sr-only">Week {week} picks: </span>
        {status.label}
      </p>
      <dl className="mt-3 grid grid-cols-[1.5fr_1fr_1fr] gap-2">
        <Stat label="Locks in" value={group.replay ? "-" : (left ?? "Locked")} note={group.replay ? "Replay clock" : undefined} />
        <Stat label="Rank" value={stats?.season ? ordinal(stats.season.place) : pending} />
        <Stat label="Points" value={stats ? `${stats.season?.total ?? stats.points.earned}` : pending} />
      </dl>
      <Link href={picksHref(group.groupId, week)} className={cn(buttonVariants(), "mt-4 h-12 w-full text-lg")}>
        {locked || status.done ? "View picks" : "Make picks"}
        <ArrowRight aria-hidden="true" />
      </Link>
    </li>
  );
}

function ScoreChip({ game }: { game: SlateGame }) {
  const started = game.awayScore != null && game.homeScore != null;
  return (
    <li className="panel flex w-40 shrink-0 snap-start items-center gap-3 p-2.5">
      <div className="min-w-0 flex-1 space-y-1">
        {[
          { team: game.away, score: game.awayScore },
          { team: game.home, score: game.homeScore },
        ].map(({ team, score }) => (
          <span
            key={team.abbr}
            className={cn("flex items-center gap-1.5", game.completed && game.winner && game.winner !== team.abbr && "text-muted-foreground")}
          >
            <TeamLogo {...team} className="size-5" />
            <span className="font-display text-base leading-none font-bold">{team.abbr}</span>
            {started && (
              <ScoreFlash value={score} className="ml-auto led px-0.5 text-base leading-none">
                {score}
              </ScoreFlash>
            )}
          </span>
        ))}
      </div>
      <GameStatus game={game} score={false} />
    </li>
  );
}

function SeasonSummary() {
  const { load, retry } = useLoad(getLeaderboard);
  const me = load.status === "ready" ? load.data?.overall.me : null;

  return (
    <div className="mt-6">
      {load.status === "error" && <LoadError title="Couldn't load your season" message={load.message} onRetry={retry} />}
      {load.status !== "error" && (
        <Board
          title="Your season"
          link={
            <Link href="/leaderboard/" className="text-sm font-semibold text-muted-foreground underline underline-offset-4 hover:text-primary">
              Leaderboard
            </Link>
          }
        >
          {load.status === "loading" && <span className="mt-3 block h-16 animate-pulse rounded-md bg-white/[0.05]" />}
          {load.status === "ready" && !me && <p className="mt-2 text-sm text-muted-foreground">No graded picks yet. Your season shows up after your first week is scored.</p>}
          {load.status === "ready" && me && (
            <dl className="mt-3 grid grid-cols-3 gap-2">
              <Stat label="Accuracy" value={pickPct(me)} note={record(me)} />
              <Stat label="Points" value={`${me.points}`} />
              <Stat label="Global rank" value={me.rank ? ordinal(me.rank) : "-"} note={`of ${load.data?.overall.players}`} />
            </dl>
          )}
        </Board>
      )}
    </div>
  );
}
