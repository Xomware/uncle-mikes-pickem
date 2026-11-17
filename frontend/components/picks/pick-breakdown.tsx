import { LightBank } from "@/components/field/icons";
import { TeamLogo } from "@/components/field/team-logo";
import type { WeekView } from "@/lib/api/client";
import { type Side, breakdown } from "@/lib/breakdown";

const pct = (share: number) => `${Math.round(share * 100)}%`;
const conf = (side: Side) => (side.avgConf === null ? "-" : side.avgConf.toFixed(1));

/** How the group split on each game, after lock: a bar per game, the GOW first, then who went against the room. */
export function PickBreakdown({ view }: { view: WeekView }) {
  const names = new Map(view.members.map((m) => [m.sub, m.name]));
  const splits = breakdown(view.games, view.picks, view.gow?.gameId ?? null);
  if (view.picks.length === 0) return null;

  return (
    <section className="mt-8" aria-labelledby="breakdown-title">
      <h2 id="breakdown-title" className="paint worn text-4xl leading-none">
        How we picked
      </h2>
      <p className="chalk mt-2 text-xs tracking-[0.14em]">Share of the group on each side, and its average confidence.</p>
      <ul className="scoreboard mt-4 space-y-1 p-2">
        {splits.map(({ game, away, home, contrarian }) => {
          const gow = view.gow?.gameId === game.gameId;
          return (
            <li key={game.gameId} className="rounded-sm bg-white/[0.04] px-2 py-2">
              {gow && (
                <span className="mb-1 flex items-center gap-1 font-display text-[0.65rem] font-extrabold tracking-wider text-primary uppercase">
                  <LightBank className="size-4" />
                  Primetime split
                </span>
              )}
              <div className="flex items-center gap-2 text-sm">
                <TeamLogo {...game.away} className="size-5" />
                <span className="w-9 font-display font-extrabold">{away.abbr}</span>
                <span className="led w-10 text-right">{pct(away.share)}</span>
                {/* Away fills from the left in LED amber, home from the right in chalk. */}
                <span
                  className="flex h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10"
                  role="img"
                  aria-label={`${away.abbr} ${pct(away.share)}, ${home.abbr} ${pct(home.share)}`}
                >
                  <span className="h-full bg-led" style={{ width: pct(away.share) }} />
                  <span className="ml-auto h-full bg-chalk/80" style={{ width: pct(home.share) }} />
                </span>
                <span className="led w-10">{pct(home.share)}</span>
                <span className="w-9 text-right font-display font-extrabold">{home.abbr}</span>
                <TeamLogo {...game.home} className="size-5" />
              </div>
              <div className="mt-1 flex justify-between text-xs text-muted-foreground tabular-nums">
                <span>Avg conf {conf(away)}</span>
                <span>Avg conf {conf(home)}</span>
              </div>
              {contrarian.length > 0 && (
                <p className="mt-1 text-xs">
                  <span className="font-display font-bold tracking-wider text-flag uppercase">Against the room: </span>
                  {contrarian.map((c) => `${names.get(c.sub) ?? "?"} (${c.team} ${c.conf})`).join(", ")}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
