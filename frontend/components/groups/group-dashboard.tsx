"use client";

import { CircleAlert, CircleCheck, CircleDashed, ListOrdered, Lock } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useCallback } from "react";

import { WeekOddsSection } from "@/components/analytics/week-odds";
import { ResultMark } from "@/components/field/result-mark";
import { Board, Stat } from "@/components/field/stat";
import { TeamLogo } from "@/components/field/team-logo";
import { GameInfoLink } from "@/components/game/game-info-link";
import { Loaded } from "@/components/loaded";
import { buttonVariants } from "@/components/ui/button";
import {
  type Game,
  type WeekResult,
  type WeekView,
  getDeathBoard,
  getPayouts,
  getSeasonStandings,
  getWeek,
  getWeekResult,
  unlessMissing,
} from "@/lib/api/client";
import { useLoad } from "@/lib/api/use-load";
import { type SheetState, sheetStatus, winnerWeeks } from "@/lib/dashboard";
import { cents } from "@/lib/payouts";
import { outcome, picksHref, spreadText } from "@/lib/picks";
import { standingsHref } from "@/lib/results";
import { ordinal } from "@/lib/stats";
import { etDate, etTime } from "@/lib/time";
import { cn } from "@/lib/utils";

interface Props {
  groupId: string;
  payouts: boolean;
  deathPool: boolean;
  /** The members and death pool tabs, under this week on a wide screen. */
  children: ReactNode;
}

/** The group's front page: this week's games and your sheet, the odds, and the leaders and pots beside them. */
export function GroupDashboard({ groupId, payouts, deathPool, children }: Props) {
  const fetcher = useCallback(() => getWeek(groupId), [groupId]);
  const { load, retry } = useLoad(fetcher);
  const view = load.status === "ready" ? load.data : null;
  const me = view?.mine?.sub ?? "";

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
      <div className="min-w-0 lg:col-span-2">
        <Loaded load={load} retry={retry} what="this week" height="h-96">
          {(v) => (
            <>
              <ThisWeek view={v} />
              {v.week.locked && <WeekOddsSection view={v} />}
            </>
          )}
        </Loaded>
      </div>
      <aside
        aria-label="Group at a glance"
        className="min-w-0 space-y-6 lg:col-start-3 lg:row-span-2 lg:row-start-1"
      >
        <Leaders groupId={groupId} me={me} />
        {view && <LatestWinner key={view.week.week} view={view} />}
        {payouts && <Pots groupId={groupId} />}
        {deathPool && <DeathCount groupId={groupId} />}
      </aside>
      <div className="min-w-0 lg:col-span-2">{children}</div>
    </div>
  );
}

const BOARD_LINK =
  "rounded-sm text-xs font-semibold tracking-wider text-muted-foreground uppercase underline-offset-4 outline-none hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring/60";

const SHEET_ICON: Record<SheetState, ReactNode> = {
  missed: <CircleAlert className="size-4 text-wrong" aria-hidden="true" />,
  in: <Lock className="size-4 text-correct" aria-hidden="true" />,
  none: <CircleDashed className="size-4 text-flag" aria-hidden="true" />,
  draft: <CircleDashed className="size-4 text-flag" aria-hidden="true" />,
  done: <CircleCheck className="size-4 text-correct" aria-hidden="true" />,
};

function ThisWeek({ view }: { view: WeekView }) {
  const { group, week } = view;
  const sheet = sheetStatus(view);
  const editable = !week.locked;

  return (
    <section className="panel overflow-hidden" aria-labelledby="this-week">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b p-4">
        <div className="mr-auto min-w-0">
          <h2 id="this-week" className="font-display text-3xl leading-none font-extrabold uppercase">
            Week {week.week}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {week.locked ? "Locked at the first kickoff" : `Locks ${etDate(week.lockAt)}`}
          </p>
        </div>
        <p className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-display text-sm font-bold tracking-wide uppercase">
          {SHEET_ICON[sheet.state]}
          <span className="sr-only">Your sheet: </span>
          {sheet.label}
        </p>
        <Link
          href={picksHref(group.groupId, week.week)}
          className={buttonVariants({ variant: editable ? "default" : "outline", className: "w-full sm:w-auto" })}
        >
          <ListOrdered aria-hidden="true" />
          {editable ? (sheet.state === "none" ? "Make your picks" : "Edit picks") : "See every pick"}
        </Link>
      </div>
      {view.games.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No games on the schedule yet.</p>
      ) : (
        <ul className="divide-y">
          {view.games.map((g) => (
            <GameRow key={g.gameId} game={g} view={view} />
          ))}
        </ul>
      )}
    </section>
  );
}

function GameRow({ game, view }: { game: Game; view: WeekView }) {
  const pick = view.mine?.picks[game.gameId];
  const result = pick ? outcome(pick, game) : null;
  const line = spreadText(game);
  const ou = game.lines?.overUnder;
  const picked = pick?.team ? (pick.team === game.away.abbr ? game.away : game.home) : null;

  return (
    <li className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-2.5", game.canceled && "opacity-60")}>
      <div className="min-w-0">
        <GameInfoLink
          groupId={view.group.groupId}
          gameId={game.gameId}
          className="flex w-fit items-center gap-1.5 rounded-sm font-display text-lg font-bold outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <TeamLogo {...game.away} className="size-5" />
          {game.away.abbr}
          <span className="text-sm text-muted-foreground">@</span>
          <TeamLogo {...game.home} className="size-5" />
          {game.home.abbr}
          {view.gow?.gameId === game.gameId && (
            <span className="ml-1 rounded-sm border border-flag/80 px-1 text-[0.65rem] tracking-[0.14em] text-flag">
              GOW
            </span>
          )}
        </GameInfoLink>
        <p className="truncate text-xs text-muted-foreground">
          {game.canceled
            ? "Canceled"
            : [
                game.state === "in" ? "Live" : game.state === "post" ? "Final" : etTime(game.kickoff),
                line,
                ou != null && `O/U ${ou}`,
              ]
                .filter(Boolean)
                .join(" · ")}
        </p>
      </div>
      <div className="flex items-center gap-2 text-right">
        {picked && pick ? (
          <>
            {result && <ResultMark result={result} className="text-xs" />}
            <TeamLogo {...picked} className="size-6" />
            <span className="font-display text-base font-bold">
              {picked.abbr}
              <span className="sr-only"> for</span>
              <span className="ml-1 rounded-sm bg-white/10 px-1.5 py-0.5 text-sm tabular-nums">{pick.conf}</span>
            </span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">{game.canceled ? "" : "No pick"}</span>
        )}
      </div>
    </li>
  );
}

const LEADERS = 5;

function Leaders({ groupId, me }: { groupId: string; me: string }) {
  const fetcher = useCallback(() => getSeasonStandings(groupId), [groupId]);
  const { load, retry } = useLoad(fetcher);
  return (
    <Loaded load={load} retry={retry} what="the standings">
      {(standings) => (
        <Board
          title={standings.throughWeek ? `Leaders · Wk ${standings.throughWeek}` : "Leaders"}
          link={
            <Link href={standingsHref(groupId)} className={BOARD_LINK}>
              Full table
            </Link>
          }
        >
          {standings.rows.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">The season table fills in once Week 1 is graded.</p>
          ) : (
            <table className="mt-2 w-full text-sm">
              <caption className="sr-only">Season leaders</caption>
              <thead className="text-xs text-muted-foreground uppercase">
                <tr>
                  <th scope="col" className="w-10 py-1 text-left font-normal">
                    Pl
                  </th>
                  <th scope="col" className="py-1 text-left font-normal">
                    Player
                  </th>
                  <th scope="col" className="py-1 text-right font-normal">
                    Pts
                  </th>
                </tr>
              </thead>
              <tbody>
                {standings.rows.slice(0, LEADERS).map((r) => (
                  <tr key={r.member} className={cn("border-t border-white/10", r.member === me && "text-primary")}>
                    <td className="led py-1.5 text-base">{r.place}</td>
                    <td className="max-w-0 truncate py-1.5 font-display font-bold">
                      {r.name}
                      {r.member === me && <span className="sr-only"> (you)</span>}
                    </td>
                    <td className="led py-1.5 text-right text-base">{r.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Board>
      )}
    </Loaded>
  );
}

async function latestResult(groupId: string, weeks: number[]): Promise<WeekResult | null> {
  for (const week of weeks) {
    const result = await unlessMissing(getWeekResult(groupId, week));
    if (result?.winners.length) return result;
  }
  return null;
}

function LatestWinner({ view }: { view: WeekView }) {
  const { groupId } = view.group;
  const fetcher = useCallback(() => latestResult(groupId, winnerWeeks(view)), [groupId, view]);
  const { load, retry } = useLoad(fetcher);
  const me = view.mine?.sub ?? "";
  return (
    <Loaded load={load} retry={retry} what="the latest winner">
      {(result) => {
        if (!result) return null;
        const names = new Map(result.members.map((m) => [m.sub, m]));
        const top = names.get(result.winners[0]);
        const mine = names.get(me);
        return (
          <Board title={`Week ${result.week} winner`}>
            <p className="mt-2 font-display text-2xl leading-tight font-extrabold uppercase">
              {result.winners.map((s) => names.get(s)?.name ?? "A former member").join(" & ")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {top && `${top.weekly} pts`}
              {result.status !== "final" && " · provisional"}
              {mine && !result.winners.includes(me) && ` · You were ${ordinal(mine.place)} of ${result.members.length}`}
            </p>
          </Board>
        );
      }}
    </Loaded>
  );
}

function Pots({ groupId }: { groupId: string }) {
  const fetcher = useCallback(() => getPayouts(groupId), [groupId]);
  const { load, retry } = useLoad(fetcher);
  return (
    <Loaded load={load} retry={retry} what="the pots">
      {(book) => {
        const lastWeek = book.weeks.at(-1);
        return (
          <Board title="Pots">
            <dl className="mt-2 grid grid-cols-2 gap-2">
              <Stat
                label="Season"
                value={cents(book.season.pot)}
                note={book.season.final ? "Final" : "Projected through Week 18"}
                className="col-span-2"
              />
              <Stat
                label={lastWeek ? `Week ${lastWeek.week}` : "Weekly"}
                value={lastWeek ? cents(lastWeek.pot) : "-"}
                note={lastWeek ? "Latest pot" : "From Week 1"}
              />
              <Stat label="Death" value={cents(book.death.pot)} note={`${book.death.entries} entries`} />
            </dl>
          </Board>
        );
      }}
    </Loaded>
  );
}

function DeathCount({ groupId }: { groupId: string }) {
  const fetcher = useCallback(() => getDeathBoard(groupId), [groupId]);
  const { load, retry } = useLoad(fetcher);
  return (
    <Loaded load={load} retry={retry} what="the death pool">
      {(board) => {
        const alive = board.entries.filter((e) => e.status === "alive");
        const mine = board.entries.filter((e) => e.mine);
        return (
          <Board title="Sudden Death">
            <dl className="mt-2 grid grid-cols-2 gap-2">
              <Stat label="Still alive" value={`${alive.length}`} note={`of ${board.entries.length} entries`} />
              <Stat
                label="Yours alive"
                value={mine.length ? `${alive.filter((e) => e.mine).length}` : "-"}
                note={mine.length ? `of ${mine.length}` : "No entry yet"}
              />
            </dl>
          </Board>
        );
      }}
    </Loaded>
  );
}
