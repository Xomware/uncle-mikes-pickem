import { GameStatus } from "@/components/field/game-status";
import { LightBank } from "@/components/field/icons";
import { ResultMark } from "@/components/field/result-mark";
import { TeamLogo } from "@/components/field/team-logo";
import { GameInfoLink } from "@/components/game/game-info-link";
import type { Team, WeekResult, WeekView } from "@/lib/api/client";
import { pickMark } from "@/lib/live";
import { gridRows } from "@/lib/picks";
import { cn } from "@/lib/utils";

/** Everyone's picks after lock, on the scoreboard: a row per member, a column per open game. */
export function GroupGrid({ view, result = null }: { view: WeekView; result?: WeekResult | null }) {
  const games = view.games.filter((g) => !g.canceled);
  const me = view.mine?.sub ?? "";
  const rows = gridRows(view, me);
  const grades = new Map(result?.members.map((m) => [m.sub, m.games]));
  const teams: Record<string, Team> = Object.fromEntries(games.flatMap((g) => [g.away, g.home]).map((t) => [t.abbr, t]));

  return (
    <section className="mt-8">
      <h2 className="paint worn text-4xl leading-none">Group picks</h2>
      <p className="chalk mt-2 text-xs tracking-[0.14em]">Team and confidence. Scroll sideways for every game.</p>
      {/* The table scrolls inside its box so the page itself never scrolls sideways on a phone. */}
      <div className="scoreboard relative mt-4 overflow-x-auto p-1" tabIndex={0} role="region" aria-label="Group picks">
        <table className="border-separate border-spacing-0.5 text-sm">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-[1] min-w-28 bg-board px-2 py-2 text-left align-bottom">
                <span className="led text-base">PLAYER</span>
              </th>
              {games.map((g) => (
                <th key={g.gameId} scope="col" className="min-w-16 px-1 py-2 text-center align-bottom font-display">
                  {view.gow?.gameId === g.gameId && (
                    <span className="mb-1 flex flex-col items-center text-[0.65rem] font-extrabold tracking-wider text-primary uppercase">
                      <LightBank className="size-4" />
                      Prime<span className="sr-only">time, game of the week</span>
                    </span>
                  )}
                  <GameInfoLink
                    groupId={view.group.groupId}
                    gameId={g.gameId}
                    aria-label={`${g.away.abbr} at ${g.home.abbr}, game info`}
                    className="block rounded-sm outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-ring/60"
                  >
                    <span className="flex items-center justify-center gap-1 text-xs font-bold text-muted-foreground">
                      <TeamLogo {...g.away} className="size-4" />
                      {g.away.abbr}
                    </span>
                    <span className="mt-0.5 flex items-center justify-center gap-1 text-base font-extrabold">
                      <TeamLogo {...g.home} className="size-5" />
                      {g.home.abbr}
                    </span>
                  </GameInfoLink>
                  <GameStatus game={g} className="mt-1" />
                </th>
              ))}
              <th scope="col" className="min-w-16 px-2 py-2 text-center align-bottom">
                <span className="led text-base">TB</span>
                <span className="sr-only">Tiebreak</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.sub}>
                <th
                  scope="row"
                  className={cn(
                    "sticky left-0 z-[1] max-w-36 truncate border-t border-white/10 bg-board px-2 py-2 text-left font-display text-base font-bold",
                    row.sub === me && "text-primary",
                  )}
                >
                  {row.name}
                  {row.sub === me && <span className="sr-only"> (you)</span>}
                </th>
                {games.map((g) => {
                  const pick = row.picks?.picks[g.gameId];
                  // Graded picks know overrides, ties and voids; the game's winner, then its live score, cover the gap before grading.
                  const mark = pickMark(pick, g, grades.get(row.sub)?.[g.gameId]);
                  return (
                    <td
                      key={g.gameId}
                      className={cn(
                        "rounded-sm px-1 py-1.5 text-center",
                        mark?.result === "correct" && (mark.live ? "bg-correct-muted/50" : "bg-correct-muted"),
                        mark?.result === "wrong" && (mark.live ? "bg-wrong-muted/50" : "bg-wrong-muted"),
                        !mark && "bg-white/[0.04]",
                      )}
                    >
                      {pick?.team ? (
                        <span className="inline-flex flex-col items-center gap-0.5 leading-tight">
                          <TeamLogo {...(teams[pick.team] ?? { abbr: pick.team })} className="size-6" />
                          <span className="font-display text-base font-extrabold">{pick.team}</span>
                          <span className="flex items-center gap-1">
                            <span className="led text-sm">{pick.conf}</span>
                            {mark && <ResultMark result={mark.result} live={mark.live} className="text-[0.62rem]" />}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground" aria-label="No pick">
                          -
                        </span>
                      )}
                    </td>
                  );
                })}
                <td className="px-2 py-2 text-center">
                  {row.picks?.tiebreak != null ? (
                    <span className="led text-base">{row.picks.tiebreak}</span>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
