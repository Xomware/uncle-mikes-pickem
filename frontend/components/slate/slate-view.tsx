"use client";

import { Check, ChevronLeft, ChevronRight, Flame, Info, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type CSSProperties, useCallback } from "react";

import { FieldTitle } from "@/components/field/field-title";
import { ScoreFlash } from "@/components/field/score-flash";
import { TeamLogo } from "@/components/field/team-logo";
import { GameInfoLink } from "@/components/game/game-info-link";
import { LoadError } from "@/components/load-error";
import { buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { type Slate, type SlateGame, type SlateGroup, type SlateTeam, getSlate } from "@/lib/api/client";
import { useLoad } from "@/lib/api/use-load";
import { useFlags } from "@/lib/flags";
import { outcome, picksHref, spreadText } from "@/lib/picks";
import { adjacentWeeks, byDay, covered, infoGroupId, kickoffTime, slateHref } from "@/lib/slate";
import { cn } from "@/lib/utils";

export function SlateView() {
  const params = useSearchParams();
  const week = Number(params.get("week")) || undefined;
  const fetcher = useCallback(() => getSlate(week), [week]);
  const { load, retry } = useLoad(fetcher);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:max-w-6xl" aria-busy={load.status === "loading"}>
      {load.status === "loading" && (
        <div className="animate-pulse space-y-3">
          <span className="block h-14 w-48 rounded bg-card/70" />
          <span className="block h-11 rounded-lg bg-card/70" />
          <span className="block h-64 rounded-xl bg-card/70" />
          <span className="sr-only">Loading the slate</span>
        </div>
      )}
      {load.status === "error" && <LoadError title="Couldn't load the slate" message={load.message} onRetry={retry} />}
      {load.status === "ready" && <SlateBody slate={load.data} />}
    </div>
  );
}

function SlateBody({ slate }: { slate: Slate }) {
  const router = useRouter();
  const { prev, next } = adjacentWeeks(slate.weeks, slate.week);
  const liveGroup = infoGroupId(slate.groups);
  const { gameInfo } = useFlags(liveGroup ?? undefined);
  const infoGroup = gameInfo && !slate.archived ? liveGroup : null;
  const topHype = Math.max(...slate.games.map((g) => g.hype ?? 0));
  const lastWeek = adjacentWeeks(slate.weeks, slate.currentWeek).prev;

  return (
    <>
      <div className="flex flex-wrap items-end gap-2">
        <FieldTitle sub={`${slate.season} season${slate.week === slate.currentWeek ? " · This week" : ""}`} className="mr-auto">
          Week {slate.week}
        </FieldTitle>
        <div className="flex items-center gap-1.5">
          <WeekLink week={prev} label="Previous week" />
          <label className="w-32">
            <span className="sr-only">Week</span>
            <Select value={slate.week} onChange={(e) => router.push(slateHref(Number(e.target.value)))}>
              {slate.weeks.map((w) => (
                <option key={w} value={w}>
                  Week {w}
                </option>
              ))}
            </Select>
          </label>
          <WeekLink week={next} label="Next week" />
        </div>
      </div>

      <nav aria-label="Jump to week" className="mt-3 inline-flex rounded-lg border bg-card p-0.5">
        <WeekTab week={slate.currentWeek} current={slate.week}>
          This week
        </WeekTab>
        {lastWeek !== null && (
          <WeekTab week={lastWeek} current={slate.week}>
            Last week
          </WeekTab>
        )}
      </nav>

      {slate.archived ? (
        <p className="panel mt-4 px-3 py-2 text-sm text-muted-foreground">Before the pick&apos;em went live: final scores and closing lines from nflverse.</p>
      ) : (
        <GroupBar groups={slate.groups} week={slate.week} games={slate.games.length} />
      )}

      {slate.games.length === 0 && (
        <p role="status" className="panel mt-6 p-4 text-sm text-muted-foreground">
          No games on the schedule for Week {slate.week} yet.
        </p>
      )}
      {byDay(slate.games).map(({ day, games }, i) => (
        <section key={day} className="mt-6 animate-rise" style={{ "--i": i } as CSSProperties} aria-label={day}>
          <h2 className="chalk text-sm tracking-[0.16em]">{day}</h2>
          <ul className="panel mt-2 divide-y overflow-hidden xl:grid xl:grid-cols-2 xl:divide-y-0">
            {games.map((g) => (
              <GameRow key={g.gameId} game={g} groups={slate.groups} infoGroup={infoGroup} top={g.hype != null && g.hype === topHype} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function WeekTab({ week, current, children }: { week: number; current: number; children: string }) {
  const on = week === current;
  return (
    <Link
      href={slateHref(week)}
      aria-current={on ? "page" : undefined}
      className={cn(
        "inline-flex min-h-9 items-center rounded-md px-3 font-display text-sm font-bold tracking-wider uppercase outline-none focus-visible:ring-3 focus-visible:ring-ring/60",
        on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

function WeekLink({ week, label }: { week: number | null; label: string }) {
  const Icon = label.startsWith("Previous") ? ChevronLeft : ChevronRight;
  if (week === null) {
    return (
      <span aria-hidden="true" className={cn(buttonVariants({ variant: "secondary" }), "w-11 px-0 opacity-40")}>
        <Icon />
      </span>
    );
  }
  return (
    <Link href={slateHref(week)} aria-label={`${label}, Week ${week}`} className={cn(buttonVariants({ variant: "secondary" }), "w-11 px-0")}>
      <Icon aria-hidden="true" />
    </Link>
  );
}

/** One link per group to this week's pick sheet, with how far along the caller is. */
function GroupBar({ groups, week, games }: { groups: SlateGroup[]; week: number; games: number }) {
  if (groups.length === 0) {
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        Join a group to see your picks beside each game.{" "}
        <Link href="/groups/" className="font-semibold text-foreground underline underline-offset-4 hover:text-primary">
          Your groups
        </Link>
      </p>
    );
  }
  return (
    <ul className="mt-4 flex flex-wrap gap-2" aria-label="Your pick sheets">
      {groups.map((g) => {
        const picked = Object.values(g.picks ?? {}).filter((p) => p.team).length;
        return (
          <li key={g.groupId} className="min-w-0">
            <Link
              href={picksHref(g.groupId, week)}
              className="flex min-h-11 max-w-full items-center gap-2 rounded-lg border bg-card px-3 text-sm outline-none hover:border-primary/70 hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/60"
            >
              <span className="truncate font-display text-base font-bold uppercase">{g.name}</span>
              {g.replay && <span className="rounded-sm border px-1 text-[0.65rem] font-bold tracking-wider text-muted-foreground uppercase">Replay</span>}
              <span className={cn("led text-sm whitespace-nowrap", picked < games && "text-muted-foreground [text-shadow:none]")}>
                {picked}/{games}
              </span>
              <span className="sr-only">picked, open the pick sheet</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function GameRow({ game, groups, infoGroup, top }: { game: SlateGame; groups: SlateGroup[]; infoGroup: string | null; top: boolean }) {
  const started = game.state === "in" || game.state === "post";
  const spread = spreadText(game);
  const cover = covered(game);
  // A group with no sheet this week shows 0 picked in the bar above, not "no pick" on every game.
  const sheets = groups.filter((g) => g.picks);
  const matchup = (
    <>
      <TeamLine team={game.away} score={started ? game.awayScore : null} result={result(game, game.away)} />
      <TeamLine team={game.home} score={started ? game.homeScore : null} result={result(game, game.home)} home />
    </>
  );

  return (
    // Phone: picks wrap under the game. Wider: they sit between the matchup and the line, one row per game.
    // xl: two games a row; divide-y can't rule a grid, so each cell draws its own lines.
    <li className="grid grid-cols-[3.75rem_minmax(0,1fr)_auto] items-start gap-x-3 px-3 py-2.5 sm:grid-cols-[4.5rem_11rem_minmax(0,1fr)_auto] sm:px-4 xl:border-t xl:odd:border-r xl:last:odd:col-span-2 xl:last:odd:border-r-0 xl:[&:nth-child(-n+2)]:border-t-0">
      <div className="pt-1 font-display leading-tight">
        {game.state === "in" && <span className="led text-base">LIVE</span>}
        {game.state === "post" && <span className="text-sm font-bold tracking-wider text-muted-foreground">FINAL</span>}
        {!started && <span className="block text-base font-bold whitespace-nowrap">{kickoffTime(game)}</span>}
        {game.broadcasts[0] && <span className="block truncate text-xs text-muted-foreground">{game.broadcasts[0]}</span>}
      </div>

      {infoGroup ? (
        <GameInfoLink
          groupId={infoGroup}
          gameId={game.gameId}
          aria-label={`${game.away.abbr} at ${game.home.abbr}, game info`}
          className="group/info -my-1 block min-w-0 rounded-md py-1 outline-none hover:bg-white/[0.04] focus-visible:ring-3 focus-visible:ring-ring/60"
        >
          {matchup}
          <span className="flex items-center gap-1 text-xs text-muted-foreground group-hover/info:text-foreground">
            <Info className="size-3.5" aria-hidden="true" />
            Game info
          </span>
        </GameInfoLink>
      ) : (
        <div className="min-w-0">{matchup}</div>
      )}

      <dl className="grid justify-items-end sm:col-start-4 sm:row-start-1 gap-0.5 pt-0.5 text-right text-xs text-muted-foreground tabular-nums">
        {spread && (
          <div>
            <dt className="sr-only">Spread</dt>
            <dd className="font-semibold text-foreground">{spread}</dd>
          </div>
        )}
        {cover && (
          <div>
            <dt className="sr-only">Against the spread</dt>
            <dd className="font-display text-xs font-bold tracking-wider text-primary uppercase">
              {cover === "PUSH" ? "Push ATS" : `${cover} covered`}
            </dd>
          </div>
        )}
        {game.lines?.overUnder != null && (
          <div>
            <dt className="inline">O/U </dt>
            <dd className="inline">{game.lines.overUnder}</dd>
          </div>
        )}
        {game.hype != null && (
          <div className={cn("inline-flex items-center gap-0.5", top && "text-primary")}>
            <dt>
              <Flame className="size-3.5" aria-hidden="true" />
              <span className="sr-only">Hype{top ? ", the week's highest" : ""}</span>
            </dt>
            <dd>{Math.round(game.hype)}</dd>
          </div>
        )}
      </dl>

      {sheets.length > 0 && (
        <ul
          className="col-span-3 mt-2 flex flex-wrap gap-1.5 sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:mt-0 sm:self-center"
          aria-label="Your picks"
        >
          {sheets.map((g) => (
            <PickChip key={g.groupId} game={game} group={g} named={groups.length > 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

function result(game: SlateGame, team: SlateTeam): "won" | "lost" | null {
  if (!game.completed || !game.winner || game.tie) return null;
  return game.winner === team.abbr ? "won" : "lost";
}

function TeamLine({ team, score, result, home = false }: { team: SlateTeam; score: number | null; result: "won" | "lost" | null; home?: boolean }) {
  const lost = result === "lost";
  return (
    <span className={cn("flex items-center gap-2 py-0.5", lost && "text-muted-foreground")}>
      <TeamLogo {...team} className={cn("size-6", lost && "opacity-50 grayscale")} />
      <span className={cn("font-display text-lg leading-none", result === "won" ? "font-extrabold" : "font-bold")}>
        {home && <span className="sr-only">at </span>}
        {team.abbr}
      </span>
      {team.record && (
        <span className="text-xs text-muted-foreground tabular-nums">
          <span className="sr-only">record </span>
          {team.record}
        </span>
      )}
      {score != null && (
        <span className="ml-auto flex items-center gap-0.5">
          <ScoreFlash value={score} className={cn("led px-0.5 text-lg leading-none", lost && "opacity-50 [text-shadow:none]")}>
            {score}
          </ScoreFlash>
          <span className="w-3">
            {result === "won" && (
              <>
                <ChevronLeft className="size-3.5 text-primary" aria-hidden="true" />
                <span className="sr-only">won</span>
              </>
            )}
          </span>
        </span>
      )}
    </span>
  );
}

function PickChip({ game, group, named }: { game: SlateGame; group: SlateGroup; named: boolean }) {
  const pick = group.picks?.[game.gameId];
  const mark = game.completed ? outcome(pick, game) : null;
  const team = pick?.team ? [game.away, game.home].find((t) => t.abbr === pick.team) : undefined;
  return (
    <li
      className={cn(
        "inline-flex h-7 max-w-full items-center gap-1.5 rounded-md bg-white/[0.05] px-2 text-xs",
        mark === "correct" && "bg-correct-muted",
        mark === "wrong" && "bg-wrong-muted",
      )}
    >
      <span className="max-w-24 truncate sm:max-w-32 text-muted-foreground">{named ? group.name : "Your pick"}</span>
      {team && pick ? (
        <>
          <TeamLogo {...team} className="size-4" />
          <span className="font-display text-sm font-bold">{team.abbr}</span>
          <span className="text-muted-foreground tabular-nums">
            <span className="sr-only">confidence </span>
            {pick.conf}
          </span>
        </>
      ) : (
        <span className="text-muted-foreground italic">no pick</span>
      )}
      {mark === "correct" && (
        <>
          <Check className="size-3.5 text-correct" aria-hidden="true" />
          <span className="sr-only">correct</span>
        </>
      )}
      {mark === "wrong" && (
        <>
          <X className="size-3.5 text-wrong" aria-hidden="true" />
          <span className="sr-only">wrong</span>
        </>
      )}
    </li>
  );
}
