import type { Game } from "@/lib/api/client";
import { ScoreFlash } from "@/components/field/score-flash";
import { finalLabel, gameClock } from "@/lib/live";
import { cn } from "@/lib/utils";

type Scored = Pick<Game, "state" | "status" | "period" | "clock" | "awayScore" | "homeScore"> & {
  away: { abbr: string };
  home: { abbr: string };
};

interface GameStatusProps {
  game: Scored;
  /** Off where the score already shows beside each team. */
  score?: boolean;
  className?: string;
}

const CHIP = "inline-flex items-center gap-1 rounded-sm border-2 px-1.5 py-0.5 font-display text-[0.65rem] leading-none font-extrabold tracking-[0.18em]";

/** LIVE with the score and game clock while it's on, FINAL with the score after. Nothing before kickoff. */
export function GameStatus({ game, score = true, className }: GameStatusProps) {
  if (game.state !== "in" && game.state !== "post") return null;
  const live = game.state === "in";
  const scored = score && game.awayScore != null && game.homeScore != null;
  const clock = live ? gameClock(game) : "";

  return (
    <span className={cn("inline-flex flex-col items-center gap-0.5", className)}>
      {live ? (
        <span className={cn(CHIP, "border-wrong/80 text-wrong")}>
          <span aria-hidden="true" className="size-1.5 rounded-full bg-wrong motion-safe:animate-pulse" />
          LIVE
        </span>
      ) : (
        <span className={cn(CHIP, "border-chalk/40 text-chalk")}>{finalLabel(game.status)}</span>
      )}
      {scored && (
        <>
          <ScoreFlash value={`${game.awayScore}-${game.homeScore}`} className="led px-0.5 text-sm leading-none whitespace-nowrap">
            <span aria-hidden="true">
              {game.awayScore}-{game.homeScore}
            </span>
          </ScoreFlash>
          <span className="sr-only">
            {game.away.abbr} {game.awayScore}, {game.home.abbr} {game.homeScore}
          </span>
        </>
      )}
      {clock && <span className="text-[0.65rem] leading-none whitespace-nowrap text-muted-foreground tabular-nums">{clock}</span>}
    </span>
  );
}
