"use client";

import { ChartColumn, Trophy } from "lucide-react";
import Link from "next/link";
import { type KeyboardEvent, useState } from "react";

import { FieldTitle } from "@/components/field/field-title";
import { Board, Stat } from "@/components/field/stat";
import { LoadError } from "@/components/load-error";
import { type LeaderBoard, type LeaderRow, type Leaderboard, getLeaderboard } from "@/lib/api/client";
import { useLoad } from "@/lib/api/use-load";
import { pickPct, pinnedMe, record } from "@/lib/leaderboard";
import { playerHref } from "@/lib/stats";
import { cn } from "@/lib/utils";

type Tab = "overall" | "thisWeek";
const TABS: Tab[] = ["overall", "thisWeek"];
const NUM = "px-2 py-2 text-right whitespace-nowrap tabular-nums";

export function LeaderboardView() {
  const { load, retry } = useLoad(getLeaderboard);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:max-w-6xl" aria-busy={load.status === "loading"}>
      {load.status === "loading" && (
        <div className="animate-pulse space-y-3">
          <span className="block h-12 w-56 rounded bg-card/70" />
          <span className="block h-72 rounded-lg bg-board" />
          <span className="sr-only">Loading the leaderboard</span>
        </div>
      )}
      {load.status === "error" && (
        <LoadError title="Couldn't load the leaderboard" message={load.message} onRetry={retry} />
      )}
      {load.status === "ready" && <Boards data={load.data} />}
    </div>
  );
}

function Boards({ data }: { data: Leaderboard | null }) {
  const [tab, setTab] = useState<Tab>("overall");

  if (!data || data.overall.players === 0) {
    return (
      <>
        <FieldTitle sub="Every group, one board">Leaders</FieldTitle>
        <p role="status" className="panel mt-6 p-4 text-sm text-muted-foreground">
          The leaderboard fills in once Week 1 is graded.
        </p>
      </>
    );
  }

  const labels: Record<Tab, string> = { overall: "Season", thisWeek: `Week ${data.week}` };

  // Arrow keys move between tabs, as a tablist should.
  function onKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const next = TABS[(TABS.indexOf(tab) + 1) % TABS.length];
    setTab(next);
    document.getElementById(`leaders-tab-${next}`)?.focus();
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <FieldTitle sub={`${data.season} season · every group`}>Leaders</FieldTitle>
        <Link
          href="/stats/"
          className="panel inline-flex h-10 items-center gap-2 px-3 font-display text-sm font-extrabold tracking-wide uppercase outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/60"
        >
          <ChartColumn className="size-4 text-primary" aria-hidden="true" />
          App stats
        </Link>
      </div>
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-x-6">
        <div className="min-w-0">
          <div role="tablist" aria-label="Leaderboard" className="panel mt-6 grid grid-cols-2 gap-1 p-1">
            {TABS.map((key) => (
              <button
                key={key}
                id={`leaders-tab-${key}`}
                type="button"
                role="tab"
                aria-selected={tab === key}
                aria-controls="leaders-panel"
                tabIndex={tab === key ? 0 : -1}
                onClick={() => setTab(key)}
                onKeyDown={onKey}
                className={cn(
                  "h-11 rounded-md px-4 font-display text-lg font-extrabold tracking-wide uppercase outline-none focus-visible:ring-3 focus-visible:ring-ring/60",
                  tab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {labels[key]}
              </button>
            ))}
          </div>
          <section
            id="leaders-panel"
            role="tabpanel"
            aria-labelledby={`leaders-tab-${tab}`}
            className="scoreboard mt-4 p-3"
          >
            <BoardTable board={data[tab]} season={tab === "overall"} />
            <ul className="mt-3 space-y-1 px-1 text-xs text-muted-foreground">
              {tab === "overall" ? (
                <li>
                  Ranked by pick %: right picks over graded picks. {data.minGraded} graded picks to be ranked; anyone
                  under that is listed, unranked.
                </li>
              ) : (
                <li>Ranked by right picks, then confidence points. Only sheets turned in for Week {data.week}.</li>
              )}
              <li>Players in more than one group show their best group.</li>
              <li>Names are first name and last initial. A group is named only if you&apos;re in it.</li>
            </ul>
          </section>
        </div>
        <YouPanel data={data} />
      </div>
    </>
  );
}

/** Your own line from both boards, beside the table on a wide screen. Phones already see it pinned in the table. */
function YouPanel({ data }: { data: Leaderboard }) {
  const { me } = data.overall;
  const week = data.thisWeek.me;
  return (
    <aside className="mt-6 hidden lg:sticky lg:top-20 lg:block" aria-label="Your standing">
      <Board title="You">
        {me ? (
          <dl className="mt-3 grid grid-cols-2 gap-2">
            <Stat label="Season rank" value={me.rank ? `#${me.rank}` : "-"} note={`of ${data.overall.players}`} />
            <Stat label="Pick %" value={pickPct(me)} note={record(me)} />
            <Stat label="Points" value={`${me.points}`} />
            <Stat label="Weeks won" value={`${me.won}`} />
          </dl>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No graded picks yet this season.</p>
        )}
        <p className="mt-4 font-display text-xs tracking-[0.14em] text-muted-foreground uppercase">Week {data.week}</p>
        {week ? (
          <dl className="mt-2 grid grid-cols-2 gap-2">
            <Stat label="Rank" value={week.rank ? `#${week.rank}` : "-"} note={`of ${data.thisWeek.players}`} />
            <Stat label="Record" value={record(week)} note={`${week.points} pts`} />
          </dl>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">No sheet graded this week.</p>
        )}
      </Board>
    </aside>
  );
}

function BoardTable({ board, season }: { board: LeaderBoard; season: boolean }) {
  if (board.players === 0) {
    return (
      <p role="status" className="p-2 text-sm text-muted-foreground">
        No sheets graded this week yet.
      </p>
    );
  }
  const pinned = pinnedMe(board);
  const cols = season ? 6 : 4;

  return (
    <>
      <p className="led px-1 text-xl">{board.players} PLAYERS</p>
      {/* Scrolls inside its box, so the page never scrolls sideways on a phone. */}
      <div className="relative mt-2 overflow-x-auto" tabIndex={0} role="region" aria-label="Leaderboard">
        <table className="w-full border-separate border-spacing-y-0.5 text-sm">
          <thead>
            <tr className="font-display text-xs tracking-[0.14em] text-muted-foreground uppercase">
              <th scope="col" className="sticky left-0 z-[1] bg-board px-2 py-1 text-left">
                Player
              </th>
              {season && (
                <th scope="col" className={NUM}>
                  Pick %
                </th>
              )}
              <th scope="col" className={NUM}>
                Record
              </th>
              <th scope="col" className={NUM}>
                <abbr title="Confidence points" className="no-underline">
                  Pts
                </abbr>
              </th>
              <th scope="col" className={NUM}>
                {season ? (
                  <abbr title="Weeks won" className="no-underline">
                    Wks
                  </abbr>
                ) : (
                  "Won"
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            {board.rows.map((r, i) => (
              <Row key={i} row={r} season={season} />
            ))}
            {pinned && (
              <>
                <tr aria-hidden="true">
                  <td colSpan={cols} className="px-2 text-center text-muted-foreground">
                    &middot; &middot; &middot;
                  </td>
                </tr>
                <Row row={pinned} season={season} />
              </>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Row({ row, season }: { row: LeaderRow; season: boolean }) {
  return (
    <tr className={row.you ? "bg-primary/15" : "bg-white/[0.04]"}>
      <th
        scope="row"
        className={cn(
          "sticky left-0 z-[1] rounded-l-sm px-2 py-2 text-left font-normal",
          // Opaque under the sticky cell, or the scrolled columns show through it.
          row.you ? "bg-[color-mix(in_oklch,var(--primary)_15%,var(--board))] shadow-[inset_3px_0_0_var(--primary)]" : "bg-board",
        )}
      >
        <span className="flex w-36 items-center gap-2 sm:w-60">
          <span className="led w-7 shrink-0 text-base">{row.rank ?? "-"}</span>
          <span
            aria-hidden="true"
            className="hidden size-8 shrink-0 items-center sm:flex justify-center rounded-md bg-turf font-stencil text-base font-black text-chalk shadow-[inset_0_-2px_0_var(--chalk)]"
          >
            {row.name.charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <Link
                href={row.you ? "/profile/" : playerHref(row.sub)}
                className="truncate font-display text-base font-bold hover:text-primary hover:underline underline-offset-4 focus-visible:underline outline-none"
              >
                {row.name}
              </Link>
              {row.you && (
                <span className="rounded-sm bg-primary px-1 font-display text-[0.65rem] font-extrabold tracking-wider text-primary-foreground uppercase">
                  You
                </span>
              )}
            </span>
            {row.group && <span className="block truncate text-xs text-muted-foreground">{row.group}</span>}
          </span>
        </span>
      </th>
      {season && (
        <td className={NUM}>
          <span className="led text-lg">{pickPct(row)}</span>
        </td>
      )}
      <td className={NUM}>{record(row)}</td>
      <td className={NUM}>{row.points}</td>
      <td className={cn(NUM, "last:rounded-r-sm")}>
        {season ? (
          row.won
        ) : row.won ? (
          <Trophy className="ml-auto size-4 text-primary" aria-label="Won the week" />
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </td>
    </tr>
  );
}
