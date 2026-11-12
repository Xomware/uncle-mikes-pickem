"use client";

import { FileSpreadsheet, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { LoadError } from "@/components/load-error";
import { Paper } from "@/components/sheets/paper";
import { SheetLoading } from "@/components/sheets/week-sheet";
import { Button } from "@/components/ui/button";
import {
  type DeathBoard,
  type SeasonStandings,
  type WeekResult,
  getDeathBoard,
  getGroup,
  getSeasonStandings,
  getWeekResult,
  unlessMissing,
} from "@/lib/api/client";
import { useLoad } from "@/lib/api/use-load";
import { downloadCsv, toCsv } from "@/lib/csv";
import { gridWeeks } from "@/lib/death";
import { groupHref } from "@/lib/groups";
import { standingsCsv } from "@/lib/sheet";
import { cn } from "@/lib/utils";

const SEASON_WEEKS = Array.from({ length: 18 }, (_, i) => i + 1);
const CELL = "px-1 py-px print:py-[1pt]";

/** Dom's standings workbook on paper: a week's results, the season table by week, then the death pool. */
export function StandingsSheet() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const week = Number(params.get("week")) || undefined;
  const fetcher = useCallback(async () => {
    const [detail, standings, death] = await Promise.all([
      getGroup(id),
      unlessMissing(getSeasonStandings(id)),
      unlessMissing(getDeathBoard(id)),
    ]);
    const shown = week ?? standings?.throughWeek;
    const result = shown ? await unlessMissing(getWeekResult(id, shown)) : null;
    return { detail, standings, death, result };
  }, [id, week]);
  const { load, retry } = useLoad(fetcher);

  if (load.status === "loading") return <SheetLoading />;
  if (load.status === "error") {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <LoadError title="Couldn't load the standings" message={load.message} onRetry={retry} />
      </div>
    );
  }
  const { detail, standings, death, result } = load.data;
  const { group } = detail;
  const csv = standings && (() => downloadCsv(`${group.season}-standings.csv`, toCsv(standingsCsv(standings))));

  return (
    <Paper
      backHref={groupHref(id)}
      backLabel="Back to group"
      landscape
      actions={
        csv && (
          <Button variant="outline" onClick={csv}>
            <FileSpreadsheet aria-hidden="true" />
            Download CSV
          </Button>
        )
      }
    >
      <div className="text-xs uppercase tabular-nums print:text-[6pt] print:leading-none">
        <header className="flex flex-wrap items-end justify-between gap-x-6 border-b-2 border-(--ink) pb-2">
          <div>
            <p className="font-semibold tracking-[0.2em] text-(--ink-soft)">Uncle Mike&apos;s NFL Pick Em</p>
            <h1 className="text-2xl font-bold print:text-lg">
              {group.season} NFL Pool <span className="text-base font-semibold">{group.name}</span>
            </h1>
          </div>
          {standings && <p className="font-semibold">Through Week {standings.throughWeek}</p>}
        </header>
        {standings ? (
          <div className="mt-3 grid grid-cols-1 gap-6 lg:grid-cols-[auto_1fr] print:mt-1 print:grid-cols-[auto_1fr] print:gap-4">
            <WeekResults result={result} />
            <SeasonTable standings={standings} />
          </div>
        ) : (
          <p role="status" className="mt-6 text-sm normal-case">
            Standings show up here once the first week is graded.
          </p>
        )}
        {death && death.entries.length > 0 && <DeathTable board={death} />}
      </div>
    </Paper>
  );
}

function WeekResults({ result }: { result: WeekResult | null }) {
  if (!result) return <p className="normal-case">This week isn&apos;t graded yet.</p>;
  const winners = new Set(result.winners);
  return (
    <table className="border-collapse self-start">
      <caption className="pb-1 text-left text-sm font-bold whitespace-nowrap">
        Week {result.week} results{result.provisional && " (provisional)"}
      </caption>
      <thead>
        <tr className="border-b-2 border-(--ink)">
          <th scope="col" className={cn(CELL, "text-left")}>Pl</th>
          <th scope="col" className={cn(CELL, "text-left")}>Player</th>
          <th scope="col" className={cn(CELL, "text-right")}>Pts</th>
        </tr>
      </thead>
      <tbody>
        {result.rows.map((r) => (
          <tr key={r.sub} className={cn("border-b border-(--rule)", winners.has(r.sub) && "bg-(--right) font-bold")}>
            <td className={CELL}>{r.place}</td>
            <td className={cn(CELL, "max-w-36 truncate normal-case")}>
              {r.name}
              {winners.has(r.sub) && " (won)"}
            </td>
            <td className={cn(CELL, "text-right font-semibold")}>{r.weekly}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SeasonTable({ standings }: { standings: SeasonStandings }) {
  return (
    <div className="relative overflow-x-auto print:overflow-visible" tabIndex={0} role="region" aria-label="Yearly standings">
      <table className="w-full border-collapse">
        <caption className="pb-1 text-left text-sm font-bold whitespace-nowrap">Yearly standings</caption>
        <thead>
          <tr className="border-b-2 border-(--ink)">
            <th scope="col" className={cn(CELL, "text-left")}>Pos</th>
            <th scope="col" className={cn(CELL, "text-left")}>Player</th>
            {SEASON_WEEKS.map((w) => (
              <th key={w} scope="col" className={cn(CELL, "text-right")}>
                <span className="sr-only">Week </span>
                {w}
              </th>
            ))}
            <th scope="col" className={cn(CELL, "border-l-2 border-(--ink) text-right")}>Total</th>
            <th scope="col" className={cn(CELL, "text-right")}>GOW</th>
          </tr>
        </thead>
        <tbody>
          {standings.rows.map((r) => (
            <tr key={r.sub} className="border-b border-(--rule)">
              <td className={CELL}>{r.place}</td>
              <td className={cn(CELL, "max-w-36 truncate font-semibold normal-case")}>{r.name}</td>
              {SEASON_WEEKS.map((w) => (
                <td key={w} className={cn(CELL, "text-right")}>
                  {r.weeks[String(w)] ?? ""}
                </td>
              ))}
              <td className={cn(CELL, "border-l-2 border-(--ink) text-right font-bold")}>{r.total}</td>
              <td className={cn(CELL, "text-right")}>{r.gow}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DeathTable({ board }: { board: DeathBoard }) {
  const weeks = gridWeeks(board.week?.number ?? null, board.entries);
  return (
    <section className="mt-6 break-before-page print:mt-0">
      <h2 className="border-b-2 border-(--ink) pb-1 text-lg font-bold">Death pool standings</h2>
      <div className="relative mt-2 overflow-x-auto print:overflow-visible" tabIndex={0} role="region" aria-label="Death pool">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-(--ink)">
              <th scope="col" className={cn(CELL, "text-left")}>Name</th>
              {weeks.map((w) => (
                <th key={w} scope="col" className={cn(CELL, "text-center")}>
                  <span className="sr-only">Week </span>
                  {w}
                </th>
              ))}
              <th scope="col" className={cn(CELL, "text-right")}>Status</th>
            </tr>
          </thead>
          <tbody>
            {board.entries.map((e) => (
              <tr key={e.entryId} className={cn("border-b border-(--rule)", e.status === "alive" && "font-bold")}>
                <th scope="row" className={cn(CELL, "max-w-40 truncate text-left normal-case")}>
                  {e.label}
                </th>
                {weeks.map((w) => {
                  const out = e.eliminatedWeek === w;
                  return (
                    <td key={w} className={cn(CELL, "text-center whitespace-nowrap", out && "bg-(--wrong)")}>
                      {out && <X className="inline size-2.5 stroke-3 align-baseline print:size-[5.5pt]" aria-label="eliminated" />}
                      {e.picks[String(w)] ?? ""}
                    </td>
                  );
                })}
                <td className={cn(CELL, "text-right whitespace-nowrap")}>
                  {e.status === "alive"
                    ? `Alive · ${e.livesLeft} ${e.livesLeft === 1 ? "life" : "lives"}`
                    : `Out wk ${e.eliminatedWeek}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
