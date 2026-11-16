"use client";

import { useCallback } from "react";

import { LoadError } from "@/components/load-error";
import { Blank, Paper, dollars } from "@/components/sheets/paper";
import { type GroupDetail, type WeekView, getGroup, getWeek } from "@/lib/api/client";
import { useLoad } from "@/lib/api/use-load";
import { useAuth } from "@/lib/auth/use-auth";
import { picksHref, spreadText } from "@/lib/picks";
import { byeTeams, easternTime, gameDates, slotName, slots } from "@/lib/sheet";
import { cn } from "@/lib/utils";

/** The weekly pick sheet laid out like Uncle Mike's paper one: blank before picks, filled after. */
export function WeekSheet({ id, week }: { id: string; week?: number }) {
  const fetcher = useCallback(() => Promise.all([getWeek(id, week), getGroup(id)]), [id, week]);
  const { load, retry } = useLoad(fetcher);
  const back = picksHref(id, week);

  if (load.status === "loading") return <SheetLoading />;
  if (load.status === "error") {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <LoadError title="Couldn't load the sheet" message={load.message} onRetry={retry} />
      </div>
    );
  }
  const [view, detail] = load.data;
  return (
    <Paper backHref={back} backLabel="Back to picks">
      <SheetBody view={view} detail={detail} />
    </Paper>
  );
}

export function SheetLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl animate-pulse space-y-3 px-4 py-6" aria-busy="true">
      <span className="block h-11 w-40 rounded bg-muted" />
      <span className="block h-[32rem] rounded-sm bg-muted" />
      <span className="sr-only">Loading the sheet</span>
    </div>
  );
}

function SheetBody({ view, detail }: { view: WeekView; detail: GroupDetail }) {
  const auth = useAuth();
  const { week, games, gow, mine } = view;
  const { fees } = detail.rules;
  const open = games.filter((g) => !g.canceled).length;
  const tiebreak = games.find((g) => g.gameId === week.tiebreakGameId);
  const name = view.members.find((m) => m.sub === mine?.sub)?.name ?? (auth.status === "signedIn" ? auth.name : null);
  const feeText = [`${dollars(fees.weekly)} WEEKLY`, `${dollars(fees.yearly)} YEARLY`];
  if (fees.death > 0) feeText.push(`${dollars(fees.death)} DEATH POOL`);

  return (
    <div className="text-sm leading-snug uppercase print:text-[10.5pt]">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1 border-b-2 border-(--ink) pb-2">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-(--ink-soft)">
            Uncle Mike&apos;s NFL Pick Em · {view.group.name}
          </p>
          <h1 className="text-3xl font-bold">
            Week {week.week} <span className="text-lg font-semibold">{gameDates(games)}</span>
          </h1>
        </div>
        <p className="font-semibold">{feeText.join(" / ")}</p>
      </header>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p>
          Name: <Blank value={name} className="min-w-48 normal-case" />
        </p>
        <p className="font-semibold">Number 1 to {open}</p>
      </div>

      <table className="mt-3 w-full border-collapse">
        <thead className="text-xs text-(--ink-soft)">
          <tr>
            <th scope="col" className="text-left font-semibold">Game</th>
            <th scope="col" className="text-left font-semibold">Line</th>
            <th scope="col" className="text-right font-semibold">Pick</th>
            <th scope="col" className="text-right font-semibold">
              <abbr title="Confidence" className="no-underline">Conf</abbr>
            </th>
          </tr>
        </thead>
        {slots(games, gow?.gameId ?? null).map((slot) => (
          <tbody key={slot.label + slot.games[0].gameId} className="break-inside-avoid">
            <tr>
              <th
                colSpan={4}
                scope="colgroup"
                className={cn("pt-3 pb-1 text-left text-xs font-bold tracking-wider", slot.gow && "text-sm")}
              >
                *** {slot.label} ***
              </th>
            </tr>
            {slot.games.map((g) => {
              const pick = mine?.picks[g.gameId];
              return (
                <tr key={g.gameId} className={cn("border-b border-(--rule)", g.canceled && "text-(--ink-soft)")}>
                  <td className={cn("py-1 pr-2 font-semibold whitespace-nowrap", g.canceled && "line-through")}>
                    {g.away.abbr} @ {g.home.abbr}
                  </td>
                  <td className="py-1 pr-2 whitespace-nowrap text-(--ink-soft)">{spreadText(g) ?? ""}</td>
                  {g.canceled ? (
                    <td colSpan={2} className="py-1 text-right text-xs font-semibold">
                      Canceled
                    </td>
                  ) : (
                    <>
                      <td className="py-1 text-right">
                        
                        <Blank value={pick?.team} className="w-14" />
                      </td>
                      <td className="py-1 pl-2 text-right">
                        
                        <Blank value={pick?.team ? pick.conf : undefined} className="w-10" />
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>

      <div className="mt-4 space-y-2">
        <p>
          Tiebreaker score
          {tiebreak && (
            <span className="text-(--ink-soft)">
              {" "}
              ({slotName(tiebreak)}: {tiebreak.away.abbr} @ {tiebreak.home.abbr})
            </span>
          )}
          : <Blank value={mine?.tiebreak ?? undefined} className="w-14" />
        </p>
        <p>
          Bye teams: <span className="font-semibold">{byeTeams(games).join(", ") || "None"}</span>
        </p>
        <p className="border-t-2 border-(--ink) pt-2 text-center font-bold">
          {week.locked ? `Picks locked ${easternTime(week.lockAt)}` : `Please have your picks in by ${easternTime(week.lockAt)}`}
        </p>
      </div>
    </div>
  );
}
