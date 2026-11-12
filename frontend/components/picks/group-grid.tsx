import { Check, Star, X } from "lucide-react";

import type { WeekView } from "@/lib/api/client";
import { gridRows, outcome } from "@/lib/picks";
import { cn } from "@/lib/utils";

/** Everyone's picks after lock: a row per member, a column per open game, green/red once results exist. */
export function GroupGrid({ view }: { view: WeekView }) {
  const games = view.games.filter((g) => !g.canceled);
  const me = view.mine?.sub ?? "";
  const rows = gridRows(view, me);

  return (
    <section className="mt-6">
      <h2 className="text-xl font-semibold uppercase">Group picks</h2>
      <p className="mt-1 text-sm text-muted-foreground">Team and confidence. Scroll sideways for every game.</p>
      {/* The table scrolls inside its box so the page itself never scrolls sideways on a phone. */}
      <div className="mt-3 overflow-x-auto rounded-xl border bg-card" tabIndex={0} role="region" aria-label="Group picks">
        <table className="border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-[1] min-w-28 border-b bg-card px-3 py-2 text-left font-semibold">
                Member
              </th>
              {games.map((g) => (
                <th key={g.gameId} scope="col" className="min-w-16 border-b px-1 py-2 text-center font-semibold">
                  <span className="block text-xs text-muted-foreground">{g.away.abbr}</span>
                  <span className="block">{g.home.abbr}</span>
                  {view.gow?.gameId === g.gameId && (
                    <span className="mt-0.5 inline-flex items-center gap-0.5 text-[0.65rem] font-semibold text-primary uppercase">
                      <Star className="size-3 fill-current" aria-hidden="true" />
                      GOW
                    </span>
                  )}
                </th>
              ))}
              <th scope="col" className="min-w-16 border-b px-2 py-2 text-center font-semibold">
                Tiebreak
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.sub}>
                <th
                  scope="row"
                  className={cn(
                    "sticky left-0 z-[1] max-w-36 truncate border-b bg-card px-3 py-2 text-left font-medium",
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
                        "border-b px-1 py-2 text-center tabular-nums",
                        result === "correct" && "bg-correct-muted text-correct",
                        result === "wrong" && "bg-wrong-muted text-wrong",
                      )}
                    >
                      {pick?.team ? (
                        <span className="inline-flex flex-col items-center leading-tight">
                          <span className="font-semibold">{pick.team}</span>
                          <span className="inline-flex items-center gap-0.5 text-xs">
                            {result === "correct" && <Check className="size-3" aria-hidden="true" />}
                            {result === "wrong" && <X className="size-3" aria-hidden="true" />}
                            {pick.conf}
                          </span>
                          {result && <span className="sr-only">{result}</span>}
                        </span>
                      ) : (
                        <span className="text-muted-foreground" aria-label="No pick">
                          -
                        </span>
                      )}
                    </td>
                  );
                })}
                <td className="border-b px-2 py-2 text-center tabular-nums">
                  {row.picks?.tiebreak ?? <span className="text-muted-foreground">-</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
