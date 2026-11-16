import { Lock } from "lucide-react";

import type { DeathBoard, DeathEntry } from "@/lib/api/client";
import { gridWeeks } from "@/lib/death";
import { Lives } from "@/components/death/lives";
import { Helmet } from "@/components/field/helmet";
import { PenaltyFlag } from "@/components/field/icons";
import { TeamLogo } from "@/components/field/team-logo";
import { cn } from "@/lib/utils";

const OUT_BG = "bg-[color-mix(in_oklch,var(--card),var(--wrong-muted)_35%)]";

export function DeathGrid({ board }: { board: DeathBoard }) {
  const { entries, startLives } = board;
  const weeks = gridWeeks(board.week?.number ?? null, entries);
  const alive = entries.filter((e) => e.status === "alive").length;

  return (
    <section className="mt-8">
      <h2 className="paint worn text-4xl leading-none">The board</h2>
      <p className="chalk mt-2 text-xs tracking-[0.14em]">
        {alive} of {entries.length} helmets lit
      </p>
      {entries.length === 0 ? (
        <p className="panel mt-3 p-4 text-muted-foreground">No entries yet.</p>
      ) : (
        // The table scrolls sideways inside its card; the page never does.
        <div className="panel relative mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Death pool picks by week</caption>
            <thead>
              <tr className="border-b text-xs text-muted-foreground uppercase">
                <th scope="col" className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-semibold">
                  Entry
                </th>
                {weeks.map((w) => (
                  <th
                    key={w}
                    scope="col"
                    className={cn("min-w-12 px-1 py-2 text-center font-semibold", w === board.week?.number && "text-primary")}
                  >
                    W{w}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <Row key={e.entryId} entry={e} weeks={weeks} startLives={startLives} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Row({ entry, weeks, startLives }: { entry: DeathEntry; weeks: number[]; startLives: number }) {
  const out = entry.status === "eliminated";
  return (
    <tr className={cn("border-b last:border-b-0", out ? OUT_BG : "bg-card")}>
      {/* Opaque background: the sticky column covers week cells scrolling under it. */}
      <th scope="row" className={cn("sticky left-0 z-10 px-3 py-2 text-left font-normal", out ? OUT_BG : "bg-card")}>
        <span className="flex items-center gap-2">
          <Helmet out={out} className="h-6 w-7 shrink-0" />
          <span className="min-w-0">
            <span
              className={cn(
                "block max-w-32 truncate font-semibold sm:max-w-48",
                out && "text-muted-foreground line-through decoration-blood decoration-2",
                entry.mine && !out && "text-primary",
              )}
            >
              {entry.label}
            </span>
            <span className="block text-xs text-muted-foreground">
              {out ? `Out Week ${entry.eliminatedWeek}` : entry.ownerName}
            </span>
          </span>
          <Lives left={entry.livesLeft} total={startLives} />
        </span>
      </th>
      {weeks.map((w) => (
        <Cell
          key={w}
          team={entry.picks[String(w)]}
          fatal={w === entry.eliminatedWeek}
          after={out && w > (entry.eliminatedWeek ?? 0)}
        />
      ))}
    </tr>
  );
}

function Cell({ team, fatal, after }: { team: string | null | undefined; fatal: boolean; after: boolean }) {
  if (after) return <td aria-label="Eliminated" className="px-1 py-2" />;
  if (team === null) {
    return (
      <td className="px-1 py-2 text-center text-muted-foreground">
        <Lock className="mx-auto size-3.5" aria-hidden="true" />
        <span className="sr-only">Picked, hidden until lock</span>
      </td>
    );
  }
  return (
    <td className="px-1 py-2 text-center">
      {fatal ? (
        <span className="inline-flex items-center gap-0.5 rounded bg-wrong-muted px-1.5 py-0.5 font-display font-bold text-wrong line-through">
          <PenaltyFlag className="size-4" />
          <span className="sr-only">Lost with </span>
          {team ?? "None"}
        </span>
      ) : (
        <span className={cn("inline-flex flex-col items-center gap-0.5 font-display font-bold", !team && "text-muted-foreground")}>
          {team && <TeamLogo abbr={team} className="size-5" />}
          {team ?? <span aria-label="No pick">-</span>}
        </span>
      )}
    </td>
  );
}
