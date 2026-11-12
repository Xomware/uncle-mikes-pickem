import { LightBank } from "@/components/field/icons";
import { ResultMark } from "@/components/field/result-mark";
import { TeamLogo } from "@/components/field/team-logo";
import type { Team, WeekView } from "@/lib/api/client";
import { gridRows, outcome } from "@/lib/picks";
import { cn } from "@/lib/utils";

/** Everyone's picks after lock, on the scoreboard: a row per member, a column per open game. */
export function GroupGrid({ view }: { view: WeekView }) {
  const games = view.games.filter((g) => !g.canceled);
  const me = view.mine?.sub ?? "";
  const rows = gridRows(view, me);
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
                  <span className="flex items-center justify-center gap-1 text-xs font-bold text-muted-foreground">
                    <TeamLogo {...g.away} className="size-4" />
                    {g.away.abbr}
                  </span>
                  <span className="mt-0.5 flex items-center justify-center gap-1 text-base font-extrabold">
                    <TeamLogo {...g.home} className="size-5" />
                    {g.home.abbr}
                  </span>
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
                  const result = outcome(pick, g);
                  return (
                    <td
                      key={g.gameId}
                      className={cn(
                        "rounded-sm px-1 py-1.5 text-center",
                        result === "correct" && "bg-correct-muted",
                        result === "wrong" && "bg-wrong-muted",
                        !result && "bg-white/[0.04]",
                      )}
                    >
                      {pick?.team ? (
                        <span className="inline-flex flex-col items-center gap-0.5 leading-tight">
                          <TeamLogo {...(teams[pick.team] ?? { abbr: pick.team })} className="size-6" />
                          <span className="font-display text-base font-extrabold">{pick.team}</span>
                          <span className="flex items-center gap-1">
                            <span className="led text-sm">{pick.conf}</span>
                            {result && <ResultMark result={result} className="text-[0.62rem]" />}
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
