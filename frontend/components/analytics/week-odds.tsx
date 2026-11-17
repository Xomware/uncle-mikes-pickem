"use client";

import { useCallback, useId, useState } from "react";

import { TeamLogo } from "@/components/field/team-logo";
import { LoadError } from "@/components/load-error";
import { type WeekOdds, type WeekView, getWeekOdds, unlessMissing } from "@/lib/api/client";
import { useLoad } from "@/lib/api/use-load";
import { pct, rooting } from "@/lib/analytics";
import { cn } from "@/lib/utils";

const TOP = 5;

/** A locked week's win odds and rooting guide. Nothing shows until the regrade has written them. */
export function WeekOddsSection({ view }: { view: WeekView }) {
  const { groupId } = view.group;
  const week = view.week.week;
  const fetcher = useCallback(() => unlessMissing(getWeekOdds(groupId, week)), [groupId, week]);
  const { load, retry } = useLoad(fetcher);

  if (load.status === "loading") {
    return (
      <div className="mt-6 h-48 animate-pulse rounded-lg bg-board">
        <span className="sr-only" role="status">
          Loading win odds
        </span>
      </div>
    );
  }
  if (load.status === "error") {
    return (
      <div className="mt-6">
        <LoadError title="Couldn't load the win odds" message={load.message} onRetry={retry} />
      </div>
    );
  }
  if (!load.data) return null;
  return (
    <>
      <WinOdds odds={load.data} me={view.mine?.sub ?? ""} />
      <RootingGuide odds={load.data} view={view} />
    </>
  );
}

export function WinOdds({ odds, me }: { odds: WeekOdds; me: string }) {
  const mine = odds.members.find((m) => m.sub === me);
  const decided = Object.keys(odds.games).length === 0;

  return (
    <section className="scoreboard mt-6 p-3" aria-labelledby="odds-title">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h2 id="odds-title" className="led text-xl">
          WIN ODDS
        </h2>
        <span className="text-xs text-muted-foreground">
          {decided ? "Every game decided" : `${odds.sims.toLocaleString()} sims, after each final`}
        </span>
      </div>
      <p className="mt-2 flex items-center justify-between gap-3 rounded-md bg-white/[0.05] px-3 py-2">
        <span className="font-display text-sm font-bold tracking-[0.18em] text-muted-foreground uppercase">
          Your chance this week
        </span>
        {mine && mine.pWin > 0 ? (
          <strong className="led text-4xl leading-none text-primary">{pct(mine.pWin)}</strong>
        ) : (
          <span className="text-sm text-muted-foreground">{mine ? "Out of reach" : "No sheet this week"}</span>
        )}
      </p>
      <ol className="mt-2 space-y-1">
        {odds.members.slice(0, TOP).map((m) => (
          <li key={m.sub} className="flex items-center gap-2 px-1 text-sm">
            <span className={cn("w-24 truncate font-display font-bold sm:w-36", m.sub === me && "text-primary")}>
              {m.name}
              {m.sub === me && <span className="sr-only"> (you)</span>}
            </span>
            <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
              <span className={cn("block h-full", m.sub === me ? "bg-primary" : "bg-led")} style={{ width: `${m.pWin * 100}%` }} />
            </span>
            <span className="led w-12 text-right text-base">{pct(m.pWin)}</span>
          </li>
        ))}
      </ol>
      <p className="mt-2 px-1 text-xs text-muted-foreground">
        Undecided games drawn from the closing line. A tie on points goes to the MNF total.
      </p>
    </section>
  );
}

function RootingGuide({ odds, view }: { odds: WeekOdds; view: WeekView }) {
  const me = view.mine?.sub ?? "";
  const selectId = useId();
  const contenders = odds.members.filter((m) => Object.keys(m.root).length > 0);
  const [sub, setSub] = useState(() => (contenders.some((m) => m.sub === me) ? me : (contenders[0]?.sub ?? "")));
  if (contenders.length === 0) return null;

  const rows = rooting(odds, sub, view.games);
  const split = odds.members.find((m) => m.sub === sub)?.root ?? {};

  return (
    <section className="mt-8" aria-labelledby="root-title">
      <h2 id="root-title" className="paint worn text-4xl leading-none">
        Who to root for
      </h2>
      <label htmlFor={selectId} className="chalk mt-3 flex items-center gap-2 text-xs tracking-[0.14em]">
        Rooting guide for
        <select
          id={selectId}
          value={sub}
          onChange={(e) => setSub(e.target.value)}
          className="min-h-11 rounded-md border border-input bg-card px-2 font-display text-sm font-bold tracking-normal text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
        >
          {contenders.map((m) => (
            <option key={m.sub} value={m.sub}>
              {m.sub === me ? `${m.name} (you)` : m.name}
            </option>
          ))}
        </select>
      </label>
      {rows.length === 0 ? (
        <p className="panel mt-3 p-4 text-sm text-muted-foreground">No game left moves these odds.</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {rows.map(({ game, side, swing }) => {
            const team = game[side];
            const other = game[side === "home" ? "away" : "home"];
            const p = split[game.gameId];
            return (
              <li key={game.gameId} className="scoreboard flex items-center gap-3 px-3 py-2">
                <TeamLogo {...team} className="size-9" />
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-base leading-tight font-extrabold uppercase">
                    Root for {team.abbr}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {game.away.abbr} @ {game.home.abbr} · {pct(p[side] ?? 0)} if {team.abbr} wins,{" "}
                    {pct(p[side === "home" ? "away" : "home"] ?? 0)} if {other.abbr} does
                  </span>
                </span>
                <span className="led text-xl text-correct">+{Math.round(swing * 100)}%</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
