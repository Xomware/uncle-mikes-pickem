"use client";

import { Check, FileSpreadsheet, X } from "lucide-react";
import Link from "next/link";
import { useCallback } from "react";

import { LoadError } from "@/components/load-error";
import { Paper } from "@/components/sheets/paper";
import { SheetLoading } from "@/components/sheets/week-sheet";
import { Button } from "@/components/ui/button";
import { type WeekResult, type WeekView, getWeek, getWeekResult, unlessMissing } from "@/lib/api/client";
import { useLoad } from "@/lib/api/use-load";
import { downloadCsv, toCsv } from "@/lib/csv";
import { gridRows, outcome, picksHref } from "@/lib/picks";
import { gameDates, groupGridCsv, sheetGames } from "@/lib/sheet";
import { cn } from "@/lib/utils";

/** Everyone's picks for a locked week on one landscape page, shaded once games are graded. */
export function GroupSheet({ id, week }: { id: string; week?: number }) {
  const fetcher = useCallback(async () => {
    const view = await getWeek(id, week);
    const result = view.week.locked ? await unlessMissing(getWeekResult(id, view.week.week)) : null;
    return { view, result };
  }, [id, week]);
  const { load, retry } = useLoad(fetcher);

  if (load.status === "loading") return <SheetLoading />;
  if (load.status === "error") {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <LoadError title="Couldn't load the group sheet" message={load.message} onRetry={retry} />
      </div>
    );
  }
  const { view, result } = load.data;
  const back = picksHref(id, view.week.week);
  if (!view.week.locked) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <p role="status" className="rounded-xl border bg-card p-5">
          Everyone&apos;s picks print here once Week {view.week.week} locks.
        </p>
        <Link href={back} className="mt-2 inline-flex min-h-11 items-center text-sm text-primary underline-offset-4 hover:underline">
          Back to picks
        </Link>
      </div>
    );
  }
  const csv = () => downloadCsv(`week-${view.week.week}-picks.csv`, toCsv(groupGridCsv(view, result)));
  return (
    <Paper
      backHref={back}
      backLabel="Back to picks"
      landscape
      actions={
        <Button variant="outline" onClick={csv}>
          <FileSpreadsheet aria-hidden="true" />
          Download CSV
        </Button>
      }
    >
      <GroupGridSheet view={view} result={result} />
    </Paper>
  );
}

const STATUS_PREFIX: Record<WeekResult["status"], string> = {
  open: "Games still playing · ",
  provisional: "Provisional · ",
  final: "",
};

function GroupGridSheet({ view, result }: { view: WeekView; result: WeekResult | null }) {
  const games = sheetGames(view);
  const gowId = view.gow?.gameId;
  const totals = new Map(result?.members.map((r) => [r.sub, r]));
  const winners = new Set(result?.winners);
  const rows = gridRows(view, "");

  return (
    <div className="uppercase">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1 border-b-2 border-(--ink) pb-2">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-(--ink-soft)">
            Uncle Mike&apos;s NFL Pick Em · {view.group.name}
          </p>
          <h1 className="text-2xl font-bold print:text-lg">
            Week {view.week.week} group picks <span className="text-base font-semibold">{gameDates(view.games)}</span>
          </h1>
        </div>
        <div className="space-y-0.5 text-right">
          <p className="flex flex-wrap items-center justify-end gap-x-3 text-[0.65rem] text-(--ink-soft) normal-case">
            <span className="inline-flex items-center gap-1">
              <Check className="size-3 stroke-3" aria-hidden="true" /> right pick
            </span>
            <span className="inline-flex items-center gap-1">
              <X className="size-3 stroke-3" aria-hidden="true" /> wrong pick
            </span>
            <span>Team, then confidence. TB is the tiebreak guess.</span>
          </p>
          <p className="text-xs font-semibold">
            {result
              ? `${STATUS_PREFIX[result.status]}Tiebreak total ${result.tiebreakTotal ?? "pending"}`
              : "Not graded yet"}
          </p>
        </div>
      </header>

      {/* Scrolls inside its box on a phone; prints at full width. */}
      <div className="mt-3 overflow-x-auto print:mt-1 print:overflow-visible" tabIndex={0} role="region" aria-label="Group picks">
        <table className="w-full border-collapse text-xs tabular-nums print:text-[6pt] print:leading-none">
          <thead>
            <tr className="border-b-2 border-(--ink)">
              <th scope="col" className="sticky left-0 bg-(--paper) py-1 pr-2 text-left print:static print:bg-transparent">
                Member
              </th>
              {games.map((g) => (
                <th
                  key={g.gameId}
                  scope="col"
                  className={cn("px-0.5 py-1 text-center font-semibold", g.gameId === gowId && "border-x-2 border-(--ink)")}
                >
                  <span className="block text-(--ink-soft)">{g.away.abbr}</span>
                  <span className="block">@{g.home.abbr}</span>
                  {g.gameId === gowId && <span className="block font-bold">GOW</span>}
                </th>
              ))}
              <th scope="col" className="px-1 py-1 text-center">TB</th>
              <th scope="col" className="px-1 py-1 text-center">Pts</th>
              <th scope="col" className="px-1 py-1 text-center">Pl</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const total = totals.get(row.sub);
              return (
                <tr key={row.sub} className={cn("border-b border-(--rule) break-inside-avoid", winners.has(row.sub) && "font-black")}>
                  <th
                    scope="row"
                    className="sticky left-0 max-w-32 truncate bg-(--paper) py-px pr-2 text-left font-semibold normal-case print:static print:max-w-28 print:bg-transparent print:py-[1pt]"
                  >
                    {row.name}
                    {winners.has(row.sub) && " (won)"}
                  </th>
                  {games.map((g) => {
                    const pick = row.picks?.picks[g.gameId];
                    // The graded result knows overrides and voids; the game's winner is the fallback before grading.
                    const graded = total?.games[g.gameId];
                    const result = total ? (graded === "right" ? "correct" : graded === "wrong" ? "wrong" : null) : outcome(pick, g);
                    return (
                      <td
                        key={g.gameId}
                        className={cn(
                          "px-0.5 py-px text-center whitespace-nowrap print:py-[1pt]",
                          g.gameId === gowId && "border-x-2 border-(--ink)",
                          result === "correct" && "bg-(--right)",
                          result === "wrong" && "bg-(--wrong) text-(--ink-soft)",
                        )}
                      >
                        {pick?.team ? (
                          <>
                            {result === "correct" && <Check className="inline size-2.5 stroke-3 align-baseline print:size-[5.5pt]" aria-label="right" />}
                            {result === "wrong" && <X className="inline size-2.5 stroke-3 align-baseline print:size-[5.5pt]" aria-label="wrong" />}
                            <span className="font-semibold">{pick.team}</span> {pick.conf}
                          </>
                        ) : (
                          <span aria-label="No pick">-</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-1 py-px text-center">{row.picks?.tiebreak ?? "-"}</td>
                  <td className="px-1 py-px text-center font-bold">{total?.weekly ?? ""}</td>
                  <td className="px-1 py-px text-center">{total?.place ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
