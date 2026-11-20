import type { Game, GameGrade, PickEntry } from "@/lib/api/client";
import { type Outcome, outcome } from "@/lib/picks";
import { gradeMark } from "@/lib/results";

export const POLL_MS = 60_000;
// The same window cron_tick ingests in: 15 minutes before kickoff until the game is final,
// or 6 hours on for one that never finishes.
const BEFORE_MS = 15 * 60_000;
const AFTER_MS = 6 * 3_600_000;

type Timed = Pick<Game, "kickoff" | "completed"> & { canceled?: boolean };

/** True while any game is about to kick off or still being played: the only time scores move. */
export function inLiveWindow(games: Timed[], now: number): boolean {
  return games.some((g) => {
    if (g.canceled || g.completed) return false;
    const kickoff = Date.parse(g.kickoff);
    return kickoff - BEFORE_MS <= now && now < kickoff + AFTER_MS;
  });
}

type Clocked = Pick<Game, "status" | "period" | "clock">;

const quarter = (period: number) => (period > 4 ? "OT" : `Q${period}`);

/** "Q3 4:12", "HALF", "END Q1", "OT 2:00"; empty when ESPN sent no clock (replay rows). */
export function gameClock({ status, period, clock }: Clocked): string {
  if (status === "STATUS_HALFTIME") return "HALF";
  if (!period) return "";
  if (status === "STATUS_END_PERIOD") return `END ${quarter(period)}`;
  return clock ? `${quarter(period)} ${clock}` : quarter(period);
}

export const finalLabel = (status: string | null) => (status === "STATUS_FINAL_OVERTIME" ? "FINAL/OT" : "FINAL");

export interface PickMark {
  result: NonNullable<Outcome>;
  /** The game is still on: the pick is winning or losing, not yet won or lost. */
  live: boolean;
}

/**
 * The grade once the week's RESULT has one, else the game's winner, else who leads right now.
 * A tie, a void and a level score stay unmarked.
 */
export function pickMark(pick: PickEntry | undefined, game: Game, grade?: GameGrade): PickMark | null {
  if (grade && grade !== "pending") {
    const graded = gradeMark(grade);
    return graded && { result: graded, live: false };
  }
  const final = outcome(pick, game);
  if (final) return { result: final, live: false };
  if (!pick?.team || game.state !== "in" || game.awayScore == null || game.homeScore == null) return null;
  if (game.awayScore === game.homeScore) return null;
  const leader = game.awayScore > game.homeScore ? game.away.abbr : game.home.abbr;
  return { result: pick.team === leader ? "correct" : "wrong", live: true };
}
