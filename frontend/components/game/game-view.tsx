"use client";

import { ArrowLeft, CircleAlert, Droplets, House, Thermometer, Wind } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type ReactNode, useCallback } from "react";

import { TeamLogo } from "@/components/field/team-logo";
import { Headshot } from "@/components/game/headshot";
import { LoadError } from "@/components/load-error";
import { type GameInfo, type InfoTeam, type Injury, getGameInfo } from "@/lib/api/client";
import { useLoad } from "@/lib/api/use-load";
import { type Severity, moneyline, severity } from "@/lib/game";
import { groupHref } from "@/lib/groups";
import { picksHref, spreadText } from "@/lib/picks";
import { etDate } from "@/lib/time";
import { cn } from "@/lib/utils";

const INDOOR = ["dome", "closed"];

export function GameView() {
  const params = useSearchParams();
  const groupId = params.get("groupId") ?? "";
  const gameId = params.get("gameId") ?? "";
  const fetcher = useCallback(() => getGameInfo(groupId, gameId), [groupId, gameId]);
  const { load, retry } = useLoad(fetcher);
  const back = load.status === "ready" ? picksHref(groupId, load.data.game.week) : groupHref(groupId);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6" aria-busy={load.status === "loading"}>
      <Link href={back} className="chalk inline-flex min-h-11 items-center gap-1.5 text-sm tracking-[0.14em] hover:text-primary">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {load.status === "ready" ? `Week ${load.data.game.week} picks` : "Back to group"}
      </Link>
      {load.status === "loading" && (
        <div className="mt-2 animate-pulse space-y-3">
          <span className="block h-44 rounded-lg bg-board" />
          <span className="block h-24 rounded-xl bg-card/70" />
          <span className="block h-48 rounded-xl bg-card/70" />
          <span className="sr-only">Loading the game</span>
        </div>
      )}
      {load.status === "error" && <LoadError title="Couldn't load this game" message={load.message} onRetry={retry} />}
      {load.status === "ready" && <GameBody info={load.data} />}
    </div>
  );
}

function GameBody({ info }: { info: GameInfo }) {
  const { game, away, home, weather, headToHead, source } = info;
  return (
    <>
      <h1 className="sr-only">
        {away.abbr} at {home.abbr}, Week {game.week}
      </h1>
      <Scoreboard info={info} />
      {source.kind === "none" && (
        <p role="note" className="panel mt-4 flex gap-2 p-3 text-sm text-muted-foreground">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {source.note}
        </p>
      )}
      <Conditions roof={game.venue.roof} weather={weather} />
      {(away.form.length > 0 || home.form.length > 0) && (
        <Section title="Last five">
          <div className="panel space-y-3 p-3">
            <FormRow team={away} />
            <FormRow team={home} />
          </div>
        </Section>
      )}
      {source.kind !== "none" && (
        <Section title="Injury report">
          <div className="space-y-4">
            <InjuryList team={away} />
            <InjuryList team={home} />
          </div>
        </Section>
      )}
      {headToHead.length > 0 && (
        <Section title="Head to head">
          <ol className="panel divide-y divide-white/10">
            {headToHead.map((m) => (
              <li key={m.kickoff} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="w-24 shrink-0 text-muted-foreground">
                  {m.season} {m.gameType === "REG" ? `Wk ${m.week}` : m.gameType}
                </span>
                <span className="font-display text-base font-bold">
                  {m.away} {m.awayScore} <span className="text-muted-foreground">@</span> {m.home} {m.homeScore}
                </span>
              </li>
            ))}
          </ol>
        </Section>
      )}
    </>
  );
}

function Scoreboard({ info }: { info: GameInfo }) {
  const { game, away, home } = info;
  const started = game.state !== "pre" && game.awayScore != null;
  const lines = game.lines;
  const where = [game.venue.name, [game.venue.city, game.venue.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
  const stats = [
    { label: "Line", value: spreadText({ away, home, lines }) },
    { label: "O/U", value: lines?.overUnder },
    {
      label: "Money",
      value: lines?.awayMoneyline != null ? `${moneyline(lines.awayMoneyline)} / ${moneyline(lines.homeMoneyline)}` : null,
    },
  ];
  return (
    <section aria-label="Matchup" className="scoreboard mt-3 px-3 pt-4 pb-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2 text-center">
        <TeamColumn team={away} split="Road" score={started ? game.awayScore : null} />
        <div className="pt-4">
          {started ? (
            <span className="led text-lg">{game.completed ? "FINAL" : "LIVE"}</span>
          ) : (
            <span className="font-display text-2xl font-extrabold text-muted-foreground">@</span>
          )}
        </div>
        <TeamColumn team={home} split="Home" score={started ? game.homeScore : null} />
      </div>
      <p className="mt-3 text-center text-sm">
        {game.timeValid === false ? "Time TBD" : etDate(game.kickoff)}
        {game.broadcasts.length > 0 && <span className="text-muted-foreground"> · {game.broadcasts.join(", ")}</span>}
      </p>
      <dl className="mt-3 grid grid-cols-3 gap-1 border-t border-white/10 pt-3 text-center">
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="font-display text-[0.65rem] font-bold tracking-[0.2em] text-muted-foreground uppercase">{s.label}</dt>
            <dd className="led mt-0.5 text-base">{s.value ?? "--"}</dd>
          </div>
        ))}
      </dl>
      {where && <p className="mt-3 text-center text-xs text-muted-foreground">{where}</p>}
    </section>
  );
}

function TeamColumn({ team, split, score }: { team: InfoTeam; split: string; score: number | null }) {
  return (
    <div className="flex min-w-0 flex-col items-center">
      <TeamLogo {...team} className="size-16 sm:size-20" />
      <span className="mt-1 font-display text-2xl leading-none font-extrabold">{team.abbr}</span>
      {team.record && (
        <span className="mt-1 text-xs text-muted-foreground">
          {team.record}
          {team.split && ` · ${split} ${team.split}`}
        </span>
      )}
      {score != null && <span className="led mt-2 text-4xl leading-none">{score}</span>}
    </div>
  );
}

function Conditions({ roof, weather }: { roof: string | null; weather: GameInfo["weather"] }) {
  if (roof && INDOOR.includes(roof)) {
    return (
      <p className="panel mt-4 flex items-center gap-2 px-3 py-3 text-sm">
        <House className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        Indoors, roof {roof === "dome" ? "fixed" : "closed"}. Weather won&apos;t matter.
      </p>
    );
  }
  if (!weather) return null;
  return (
    <Section title="Weather">
      <div className="panel flex flex-wrap items-center gap-x-5 gap-y-2 p-3">
        <span className="flex items-center gap-2">
          <Thermometer className="size-6 text-led" aria-hidden="true" />
          <span className="led text-3xl leading-none">{weather.temperature != null ? `${weather.temperature}°` : "--"}</span>
          <span className="text-sm">{weather.description ?? "Forecast"}</span>
        </span>
        {weather.gust != null && (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Wind className="size-4" aria-hidden="true" />
            Gusts {weather.gust} mph
          </span>
        )}
        {weather.precipitation != null && (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Droplets className="size-4" aria-hidden="true" />
            Precip {weather.precipitation}%
          </span>
        )}
        {roof === "open" && <span className="text-sm text-muted-foreground">Retractable roof, open</span>}
      </div>
    </Section>
  );
}

const RESULT_STYLE = { W: "bg-correct-muted text-correct", L: "bg-wrong-muted text-wrong", T: "bg-secondary text-foreground" };

function FormRow({ team }: { team: InfoTeam }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex w-16 shrink-0 items-center gap-1.5 font-display text-base font-extrabold">
        <TeamLogo {...team} className="size-5" />
        {team.abbr}
      </span>
      <ol className="grid flex-1 grid-cols-5 gap-1" aria-label={`${team.abbr} last five, oldest first`}>
        {team.form.map((f) => (
          <li key={f.week} title={`Week ${f.week}: ${f.score}`} className={cn("rounded px-0.5 py-1 text-center", RESULT_STYLE[f.result])}>
            <span className="block font-display text-base leading-none font-extrabold">{f.result}</span>
            <span className="mt-0.5 block text-[0.62rem] leading-none whitespace-nowrap opacity-80">
              {f.atVs === "@" ? "@" : "v"}
              {f.opponent}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const CHIP: Record<Severity, string> = {
  out: "bg-wrong-muted text-wrong",
  doubtful: "bg-[oklch(0.34_0.08_55)] text-[oklch(0.84_0.14_60)]",
  questionable: "bg-[oklch(0.34_0.07_96)] text-primary",
  ir: "bg-secondary text-muted-foreground",
  other: "border text-muted-foreground",
};

function InjuryList({ team }: { team: InfoTeam }) {
  return (
    <div className="panel p-3">
      <h3 className="flex items-center gap-2 font-display text-lg font-extrabold uppercase">
        <TeamLogo {...team} className="size-6" />
        {team.name ?? team.abbr}
      </h3>
      {team.injuries.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No injuries reported.</p>
      ) : (
        <ul className="mt-2 divide-y divide-white/10">
          {team.injuries.map((i) => (
            <InjuryRow key={`${i.name}-${i.status}`} injury={i} />
          ))}
        </ul>
      )}
    </div>
  );
}

function InjuryRow({ injury }: { injury: Injury }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <Headshot name={injury.name} src={injury.headshot} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">
          {injury.name} <span className="text-sm font-normal text-muted-foreground">{injury.position}</span>
        </span>
        {injury.detail && <span className="block truncate text-sm text-muted-foreground">{injury.detail}</span>}
      </span>
      <span className={cn("shrink-0 rounded px-2 py-1 font-display text-xs font-bold tracking-wider uppercase", CHIP[severity(injury.status)])}>
        {injury.status}
      </span>
    </li>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="paint worn mb-2 text-3xl leading-none">{title}</h2>
      {children}
    </section>
  );
}
