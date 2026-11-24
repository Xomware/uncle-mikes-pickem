"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { ResultMark } from "@/components/field/result-mark";
import { TeamLogo } from "@/components/field/team-logo";
import { GameInfoLink } from "@/components/game/game-info-link";
import { LoadError } from "@/components/load-error";
import { GroupPicker } from "@/components/teams/group-picker";
import { useTeams } from "@/components/teams/use-teams";
import type { GamePicks, NflTeams, PickRecords, ScheduleGame, ScheduleRow, TeamRecord, TeamSeason } from "@/lib/api/client";
import { atsResult, lineText, pickOutcome, recordText, seasonLine, splitSchedule, teamHref, teamsHref } from "@/lib/teams";
import { etDate, etDay } from "@/lib/time";
import { cn } from "@/lib/utils";

const RESULT_STYLE = { W: "bg-correct-muted text-correct", L: "bg-wrong-muted text-wrong", T: "bg-secondary text-foreground" };
const ATS_TEXT = { W: "Covered", L: "No cover", P: "Push" };
const ATS_STYLE = { W: "text-correct", L: "text-wrong", P: "text-muted-foreground" };

export function TeamView() {
  const params = useSearchParams();
  const abbr = (params.get("team") ?? "").toUpperCase();
  const { load, retry } = useTeams(abbr);
  const groupId = load.status === "ready" ? load.data.data.group?.groupId : params.get("groupId");

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:max-w-6xl" aria-busy={load.status === "loading"}>
      <Link href={teamsHref(groupId)} className="chalk inline-flex min-h-11 items-center gap-1.5 text-sm tracking-[0.14em] hover:text-primary">
        <ArrowLeft className="size-4" aria-hidden="true" />
        All teams
      </Link>
      {load.status === "loading" && (
        <div className="mt-2 animate-pulse space-y-3">
          <span className="block h-40 rounded-lg bg-board" />
          <span className="block h-24 rounded-xl bg-card/70" />
          <span className="block h-96 rounded-xl bg-card/70" />
          <span className="sr-only">Loading the team</span>
        </div>
      )}
      {load.status === "error" && <LoadError title="Couldn't load this team" message={load.message} onRetry={retry} />}
      {load.status === "ready" && !load.data.data.team && (
        <p className="panel mt-2 p-4 text-muted-foreground">
          No team picked.{" "}
          <Link href={teamsHref(groupId)} className="font-semibold text-primary underline-offset-4 hover:underline">
            Choose one from the teams list
          </Link>
          .
        </p>
      )}
      {load.status === "ready" && load.data.data.team && (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="chalk text-xs tracking-[0.14em]">{seasonLine(load.data.data)}</p>
            <GroupPicker groups={load.data.groups} current={groupId ?? ""} />
          </div>
          <TeamBody data={load.data.data} team={load.data.data.team} />
        </>
      )}
    </div>
  );
}

function TeamBody({ data, team }: { data: NflTeams; team: TeamSeason }) {
  const groupId = data.group?.groupId;
  const records: Record<string, TeamRecord> = Object.fromEntries(data.teams.map((t) => [t.abbr, t]));
  const { played, upcoming } = splitSchedule(team.schedule);
  const list = (id: string, title: string, rows: ScheduleRow[]) =>
    rows.length > 0 && (
      <section className="mt-6" aria-labelledby={id}>
        <h2 id={id} className="paint worn mb-2 text-3xl leading-none">
          {title}
        </h2>
        <ol className="panel divide-y divide-white/10">
          {rows.map((row) =>
            row.bye ? (
              <li key={row.week} className="flex items-center gap-3 px-3 py-1.5 text-sm text-muted-foreground">
                <WeekNumber week={row.week} />
                <span className="font-display font-bold tracking-[0.2em] uppercase">Bye</span>
              </li>
            ) : (
              <GameRow key={row.week} game={row} abbr={team.abbr} groupId={groupId} opponent={records[row.opponent.abbr]} />
            ),
          )}
        </ol>
      </section>
    );
  return (
    <>
      <div className={cn(team.picks && "lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end lg:gap-x-6")}>
        <Header team={team} />
        {team.picks && <PickTable abbr={team.abbr} picks={team.picks} />}
      </div>
      <div className={cn(played.length > 0 && upcoming.length > 0 && "lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-6")}>
        {list("results", "Results", played)}
        {list("upcoming", "Upcoming", upcoming)}
      </div>
    </>
  );
}

function Header({ team }: { team: TeamSeason }) {
  const stats = [
    { label: "Home", value: recordText(team.home) },
    { label: "Road", value: recordText(team.road) },
    { label: "Div", value: recordText(team.divisionRecord) },
    { label: "PF", value: team.pointsFor },
    { label: "PA", value: team.pointsAgainst },
  ];
  return (
    <section aria-label={`${team.name} record`} className="scoreboard p-3">
      <div className="flex items-center gap-3">
        <TeamLogo {...team} className="size-16 sm:size-20" />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl leading-none font-extrabold uppercase sm:text-3xl">{team.name}</h1>
          <p className="mt-1 text-xs tracking-[0.16em] text-muted-foreground uppercase">
            {team.conference} {team.division}
          </p>
        </div>
        <div className="text-right">
          <span className="led block text-4xl leading-none sm:text-5xl">{recordText(team.overall)}</span>
          {team.form.length > 0 && (
            <ol className="mt-1.5 flex justify-end gap-0.5" aria-label="Last results, oldest first">
              {team.form.map((r, i) => (
                <li key={i} className={cn("w-5 rounded-sm text-center font-display text-xs leading-5 font-extrabold", RESULT_STYLE[r])}>
                  {r}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-5 gap-1 border-t border-white/10 pt-2 text-center">
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="font-display text-[0.65rem] font-bold tracking-[0.2em] text-muted-foreground uppercase">{s.label}</dt>
            <dd className="led text-base">{s.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function PickTable({ abbr, picks }: { abbr: string; picks: NonNullable<TeamSeason["picks"]> }) {
  const rows: [string, PickRecords][] = [
    ["You", picks.mine],
    ["Group", picks.group],
  ];
  return (
    <section className="mt-4" aria-labelledby="pick-records">
      <h2 id="pick-records" className="paint worn mb-2 text-3xl leading-none">
        Picking {abbr}
      </h2>
      <table className="panel w-full text-sm">
        <caption className="sr-only">Pick records on {abbr} games: a pick against them wins when they lose</caption>
        <thead className="text-[0.65rem] tracking-[0.16em] text-muted-foreground uppercase">
          <tr>
            <td />
            <th scope="col" className="px-3 pt-2 text-right font-bold">
              Took {abbr}
            </th>
            <th scope="col" className="px-3 pt-2 text-right font-bold">
              Took against
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([who, rec]) => (
            <tr key={who}>
              <th scope="row" className="px-3 py-1.5 text-left font-display text-base font-bold">
                {who}
              </th>
              <td className="led px-3 text-right text-lg">{recordText(rec.for)}</td>
              <td className="led px-3 text-right text-lg">{recordText(rec.against)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function WeekNumber({ week }: { week: number }) {
  return (
    <span className="w-9 shrink-0 font-display text-xs font-bold tracking-wider text-muted-foreground uppercase">
      <span aria-hidden="true">Wk</span>
      <span className="sr-only">Week</span> {week}
    </span>
  );
}

interface GameRowProps {
  game: ScheduleGame;
  abbr: string;
  groupId?: string;
  opponent?: TeamRecord;
}

function GameRow({ game, abbr, groupId, opponent }: GameRowProps) {
  const played = game.result != null || (game.state === "in" && game.score != null);
  const line = lineText(game.spread);
  const ats = atsResult(game);
  const when = game.timeValid ? etDate(game.kickoff) : `${etDay(game.kickoff)} · Time TBD`;
  // The score once there is one, else the kickoff, links to the game page.
  const info = (children: ReactNode, className: string) =>
    groupId && !game.archived ? (
      <GameInfoLink
        groupId={groupId}
        gameId={game.gameId}
        className={cn("rounded-sm outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/60", className)}
      >
        {children}
      </GameInfoLink>
    ) : (
      <span className={className}>{children}</span>
    );

  return (
    <li className="flex items-start gap-3 px-3 py-2">
      <span className="pt-2.5">
        <WeekNumber week={game.week} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3">
          <Link
            href={teamHref(game.opponent.abbr, groupId)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-sm outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <span className="w-4 text-sm text-muted-foreground">{game.home ? "vs" : "@"}</span>
            <TeamLogo {...game.opponent} className="size-7" />
            <span className="font-display text-lg leading-none font-extrabold">{game.opponent.abbr}</span>
            {opponent && <span className="text-xs text-muted-foreground tabular-nums">{recordText(opponent.overall)}</span>}
          </Link>
          {played &&
            info(
              <>
                {game.result ? (
                  <span className={cn("mr-1.5 inline-block w-5 rounded-sm text-center font-display leading-5 font-extrabold", RESULT_STYLE[game.result])}>
                    {game.result}
                  </span>
                ) : (
                  <span className="led mr-1.5 text-xs">LIVE</span>
                )}
                <span className="font-display text-lg font-extrabold tabular-nums">
                  {game.score}-{game.opponentScore}
                </span>
              </>,
              "inline-flex min-h-9 items-center",
            )}
        </div>
        <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          {played ? <span>{etDay(game.kickoff)}</span> : info(when, "text-foreground")}
          {game.neutralSite && <span>Neutral site</span>}
          {!played && game.broadcasts.length > 0 && <span>{game.broadcasts.join(", ")}</span>}
          {game.picks && <Picks game={game} picks={game.picks} abbr={abbr} />}
        </p>
      </div>
      <span className="shrink-0 pt-1.5 text-right">
        <span className="sr-only">Line </span>
        <span className="led text-base">{line ?? "--"}</span>
        {ats ? (
          <span className={cn("block font-display text-[0.65rem] font-bold tracking-wider uppercase", ATS_STYLE[ats])}>{ATS_TEXT[ats]}</span>
        ) : (
          game.overUnder != null && <span className="block text-[0.65rem] text-muted-foreground">O/U {game.overUnder}</span>
        )}
      </span>
    </li>
  );
}

function Picks({ game, picks, abbr }: { game: ScheduleGame; picks: GamePicks; abbr: string }) {
  if (picks.canceled) return <span>Voided in this group</span>;
  const mark = picks.mine?.team ? pickOutcome(game, abbr, picks.mine.team) : null;
  return (
    <>
      {picks.mine?.team && (
        <span className="inline-flex items-center gap-1 text-foreground">
          You: {picks.mine.team} <span className="led">{picks.mine.conf}</span>
          {mark && <ResultMark result={mark} className="text-[0.55rem]" />}
        </span>
      )}
      <span>
        Group: {picks.for} {abbr} · {picks.against} {game.opponent.abbr}
      </span>
    </>
  );
}
