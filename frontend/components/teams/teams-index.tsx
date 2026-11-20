"use client";

import Link from "next/link";

import { FieldTitle } from "@/components/field/field-title";
import { TeamLogo } from "@/components/field/team-logo";
import { LoadError } from "@/components/load-error";
import { GroupPicker } from "@/components/teams/group-picker";
import { useTeams } from "@/components/teams/use-teams";
import type { NflTeams, TeamRecord } from "@/lib/api/client";
import { divisions, recordText, seasonLine, teamHref } from "@/lib/teams";
import { cn } from "@/lib/utils";

export function TeamsIndex() {
  const { load, retry } = useTeams();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6" aria-busy={load.status === "loading"}>
      {load.status === "loading" && (
        <div className="animate-pulse space-y-3">
          <span className="block h-14 w-48 rounded bg-card/70" />
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 8 }, (_, i) => (
              <span key={i} className="block h-48 rounded-xl bg-card/70" />
            ))}
          </div>
          <span className="sr-only">Loading teams</span>
        </div>
      )}
      {load.status === "error" && <LoadError title="Couldn't load the teams" message={load.message} onRetry={retry} />}
      {load.status === "ready" && (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <FieldTitle sub={seasonLine(load.data.data)}>Teams</FieldTitle>
            <GroupPicker groups={load.data.groups} current={load.data.data.group?.groupId ?? ""} />
          </div>
          <Divisions data={load.data.data} />
        </>
      )}
    </div>
  );
}

function Divisions({ data }: { data: NflTeams }) {
  const groupId = data.group?.groupId;
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {divisions(data.teams).map(({ conference, division, teams }) => (
        <section key={`${conference}-${division}`} className="panel overflow-hidden" aria-labelledby={`div-${conference}-${division}`}>
          <table className="w-full table-fixed text-sm">
            <caption id={`div-${conference}-${division}`} className="bg-secondary px-3 py-1.5 text-left font-display text-base font-extrabold tracking-wider uppercase">
              {conference} {division}
            </caption>
            <thead className="text-[0.65rem] tracking-[0.16em] text-muted-foreground uppercase">
              <tr>
                <th scope="col" className="px-3 pt-1.5 text-left font-bold">
                  Team
                </th>
                <th scope="col" className="w-16 pt-1.5 text-right font-bold">
                  W-L
                </th>
                <th scope="col" className="w-12 pt-1.5 text-right font-bold">
                  <abbr title="Division record" className="no-underline">
                    Div
                  </abbr>
                </th>
                <th scope="col" className="w-14 pt-1.5 pr-3 text-right font-bold">
                  <abbr title="Point differential" className="no-underline">
                    Diff
                  </abbr>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {teams.map((t) => (
                <TeamRow key={t.abbr} team={t} groupId={groupId} />
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

function TeamRow({ team, groupId }: { team: TeamRecord; groupId?: string }) {
  const diff = team.pointsFor - team.pointsAgainst;
  return (
    // The team link stretches over the row, so the whole row is the tap target.
    <tr className="relative hover:bg-white/5 has-focus-visible:bg-white/5">
      <td className="py-1.5 pl-3">
        <Link
          href={teamHref(team.abbr, groupId)}
          className="flex min-h-9 min-w-0 items-center gap-2 outline-none after:absolute after:inset-0 focus-visible:after:rounded-sm focus-visible:after:ring-2 focus-visible:after:ring-ring/60 focus-visible:after:ring-inset"
        >
          <TeamLogo {...team} className="size-7" />
          <span className="w-10 shrink-0 font-display text-lg leading-none font-extrabold">{team.abbr}</span>
          <span className="truncate text-xs text-muted-foreground">{team.name}</span>
        </Link>
      </td>
      <td className="led text-right text-base whitespace-nowrap">{recordText(team.overall)}</td>
      <td className="text-right whitespace-nowrap text-muted-foreground tabular-nums">{recordText(team.divisionRecord)}</td>
      <td className={cn("pr-3 text-right font-semibold tabular-nums", diff > 0 && "text-correct", diff < 0 && "text-wrong")}>
        {diff > 0 ? `+${diff}` : diff}
      </td>
    </tr>
  );
}
