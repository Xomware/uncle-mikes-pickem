"use client";

import { type CSSProperties, useCallback } from "react";

import { LoadError } from "@/components/load-error";
import { TeamLogo } from "@/components/field/team-logo";
import { Blank, Paper, dollars } from "@/components/sheets/paper";
import {
  type GroupDetail,
  type Team,
  type WeekView,
  getGroup,
  getWeek,
} from "@/lib/api/client";
import { useLoad } from "@/lib/api/use-load";
import { useAuth } from "@/lib/auth/use-auth";
import { picksHref } from "@/lib/picks";
import { byeTeams, deadline, gameDates, slotName, slots } from "@/lib/sheet";
import { cn } from "@/lib/utils";

/** The weekly pick sheet laid out like Uncle Mike's paper one: blank before picks, filled after. */
export function WeekSheet({ id, week }: { id: string; week?: number }) {
  const fetcher = useCallback(
    () => Promise.all([getWeek(id, week), getGroup(id)]),
    [id, week],
  );
  const { load, retry } = useLoad(fetcher);
  const back = picksHref(id, week);

  if (load.status === "loading") return <SheetLoading />;
  if (load.status === "error") {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <LoadError
          title="Couldn't load the sheet"
          message={load.message}
          onRetry={retry}
        />
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
    <div
      className="mx-auto w-full max-w-3xl animate-pulse space-y-3 px-4 py-6"
      aria-busy="true"
    >
      <span className="block h-11 w-40 rounded bg-muted" />
      <span className="block h-[32rem] rounded-sm bg-muted" />
      <span className="sr-only">Loading the sheet</span>
    </div>
  );
}

// The paper sheet's own tags: Thursday and the night games get a bar, Sunday afternoon doesn't.
const BAR: Record<string, string> = {
  "MONDAY NIGHT GAME": "*MONDAY NIGHT GAME *",
};
const barText = (label: string) => BAR[label] ?? `*** ${label} ***`;
const barred = (label: string) => !label.startsWith("SUNDAY GAME");

const firstName = (name: string | undefined) =>
  name?.split(" ")[0]?.toUpperCase() ?? "YOUR ORGANIZER";

function SheetBody({ view, detail }: { view: WeekView; detail: GroupDetail }) {
  const auth = useAuth();
  const { week, games, gow, mine } = view;
  const { fees } = detail.rules;
  const open = games.filter((g) => !g.canceled).length;
  const tiebreak = games.find((g) => g.gameId === week.tiebreakGameId);
  const byes = byeTeams(games);
  const groups = slots(games, gow?.gameId ?? null);
  const name =
    view.members.find((m) => m.sub === mine?.sub)?.name ??
    (auth.status === "signedIn" ? auth.name : null);
  const organizer = firstName(
    detail.members.find((m) => m.sub === detail.group.ownerSub)?.name,
  );
  const total = mine
    ? Object.values(mine.picks).reduce(
        (sum, p) => sum + (p.team ? (p.conf ?? 0) : 0),
        0,
      )
    : null;
  // Rows share the page height left after the title and the footer, so 16 games still print on one sheet.
  const rows = games.length + groups.filter((g) => barred(g.label)).length;

  return (
    <div
      className="font-[Helvetica,Arial,sans-serif] text-sm leading-tight font-bold uppercase print:text-[10pt]"
      style={{ "--row": `calc(6.9in / ${rows})` } as CSSProperties}
    >
      <h1 className="text-center font-[Helvetica,Arial,sans-serif] text-xl font-bold print:text-[15pt]">
        Week {week.week}&nbsp;&nbsp;{gameDates(games)}
      </h1>

      <table className="mt-4 w-full table-fixed border-collapse">
        <colgroup>
          <col />
          <col className="w-10" />
          <col />
          <col className="w-16" />
          <col className="w-14 sm:w-40" />
        </colgroup>
        {groups.map((slot) => (
          <tbody
            key={slot.label + slot.games[0].gameId}
            className="break-inside-avoid"
          >
            {barred(slot.label) && (
              <tr>
                <th
                  colSpan={3}
                  scope="colgroup"
                  className="border border-(--ink) bg-(--bar) py-0.5 text-center print:h-(--row)"
                >
                  {barText(slot.label)}
                </th>
                <td className="border border-(--ink)" />
                <td />
              </tr>
            )}
            {slot.games.map((g) => {
              const pick = mine?.picks[g.gameId];
              const picked = pick?.team || null;
              return (
                <tr
                  key={g.gameId}
                  className={cn(
                    "h-14 print:h-(--row)",
                    g.canceled && "text-(--ink-soft)",
                  )}
                >
                  <td className="border-y border-l border-(--ink) text-center">
                    <PaperLogo team={g.away} circled={picked === g.away.abbr} />
                  </td>
                  <td
                    className={cn(
                      "border-y border-(--ink) pt-3 text-center text-base",
                      g.canceled && "line-through",
                    )}
                  >
                    @
                  </td>
                  <td className="border-y border-r border-(--ink) text-center">
                    <PaperLogo team={g.home} circled={picked === g.home.abbr} />
                  </td>
                  <td className="border border-(--ink) text-center text-2xl tabular-nums print:text-[18pt]">
                    {g.canceled ? (
                      <span className="text-[0.6rem]">Canceled</span>
                    ) : picked ? (
                      pick?.conf
                    ) : null}
                  </td>
                  <td className="pl-2 text-xs whitespace-nowrap print:text-[9pt]">
                    {slot.gow && (
                      <>
                        <span className="sm:hidden">&lt;GOW</span>
                        <span className="max-sm:hidden">
                          &lt;Game of the week
                        </span>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 font-normal">
        <span className="text-base">Bye teams:</span>
        {byes.length ? (
          byes.map((abbr) => <PaperLogo key={abbr} team={{ abbr }} />)
        ) : (
          <span>None</span>
        )}
      </div>

      <p className="mt-4 flex items-baseline justify-center gap-6 text-xs print:text-[9pt]">
        <span>
          Name: <Blank value={name} className="min-w-56 normal-case" />
        </span>
        <span className="text-base tabular-nums">{total ?? ""}</span>
      </p>

      <div className="mt-3 grid grid-cols-[auto_1fr] gap-x-8 gap-y-1.5 text-[0.7rem] print:text-[8pt]">
        <p>
          <Blank className="w-16" /> {dollars(fees.weekly)} weekly
        </p>
        <p className="text-xs print:text-[9pt]">Number 1 to {open}</p>
        <p>
          <Blank className="w-16" /> {dollars(fees.yearly)} yearly
        </p>
        <p className="text-xs print:text-[9pt]">
          Tiebreaker score (
          {tiebreak ? (
            <span className="normal-case">{titleCase(slotName(tiebreak))}</span>
          ) : (
            "Monday Night Game"
          )}
          ) : <Blank value={mine?.tiebreak ?? undefined} className="w-24" />
        </p>
        {fees.death > 0 && (
          <p>
            <Blank className="w-16" /> {dollars(fees.death)} sudden death
          </p>
        )}
      </div>

      <div className="mt-4 grid grid-cols-[1fr_auto] items-end gap-x-6 text-xs print:text-[9pt]">
        <div className="text-center">
          <p className="bg-[oklch(0.95_0.2_105)] py-0.5 text-[oklch(0.55_0.24_27)]">
            Please have your picks in by{" "}
            <Ordinal text={deadline(week.lockAt)} />
          </p>
          <p>No picks will be accepted after this time.</p>
          <p>Any questions or concerns, call {organizer}</p>
        </div>
        {fees.death > 0 && (
          <div className="text-[0.65rem] print:text-[7.5pt]">
            <p>Sudden death pool team:</p>
            <span className="mt-1 block h-6 w-36 border border-(--ink) bg-[oklch(0.84_0.09_55)]" />
          </div>
        )}
      </div>
    </div>
  );
}

const titleCase = (s: string) =>
  s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/** A team logo the size the paper prints them; a pick is circled the way a pen would. */
function PaperLogo({
  team,
  circled = false,
}: {
  team: Team;
  circled?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex size-10 items-center justify-center rounded-full border-2 border-transparent align-middle print:size-[min(0.42in,calc(var(--row)-3px))]",
        circled && "border-(--ink)",
      )}
    >
      <span className="size-7 print:size-[min(0.3in,calc(var(--row)-12px))]">
        <TeamLogo
          {...team}
          loading="eager"
          className="size-full drop-shadow-none"
        />
      </span>
      <span className="sr-only">
        {team.abbr}
        {circled ? " (picked)" : ""}
      </span>
    </span>
  );
}

/** The paper writes "19th" in lowercase inside an all-caps line. */
function Ordinal({ text }: { text: string }) {
  return text.split(/(?<=\d)(st|nd|rd|th)\b/).map((part, i) =>
    i % 2 ? (
      <span key={i} className="normal-case">
        {part}
      </span>
    ) : (
      part
    ),
  );
}
