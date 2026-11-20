import type { GradeTally, MyStats } from "@/lib/api/client";

export const decided = (t: GradeTally) => t.right + t.wrong + t.tie;

/** Share of decided picks that were right, or null with none decided. A tie under the zero rule is a miss. */
export const pickRate = (t: GradeTally): number | null => (decided(t) ? t.right / decided(t) : null);

/** "12-4", or "12-4-1" once there is a tie. */
export const recordText = (t: GradeTally) => [t.right, t.wrong, ...(t.tie ? [t.tie] : [])].join("-");

/** "1st", "22nd"; the tiebreak star on a shared place is dropped. */
export function ordinal(place: string | number): string {
  const n = Number(String(place).replace("*", ""));
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

type TeamRow = MyStats["teams"][number];

/**
 * The teams the member does best and worst picking. A team needs `min` decided picks to count. Best
 * are at .500 or better, worst below it, so a losing team never shows as a best. More picks wins a
 * tie on the rate.
 */
export function teamSplits(teams: TeamRow[], min = 2, n = 3): { best: TeamRow[]; worst: TeamRow[] } {
  const rated = teams.filter((t) => decided(t) >= min);
  const rate = (t: TeamRow) => pickRate(t) ?? 0;
  const byVolume = (a: TeamRow, b: TeamRow) => decided(b) - decided(a) || a.team.localeCompare(b.team);
  const best = rated.filter((t) => rate(t) >= 0.5).sort((a, b) => rate(b) - rate(a) || byVolume(a, b));
  const worst = rated.filter((t) => rate(t) < 0.5).sort((a, b) => rate(a) - rate(b) || byVolume(a, b));
  return { best: best.slice(0, n), worst: worst.slice(0, n) };
}

/** Best and average weekly place over the weeks graded, missed weeks included. */
export function finishes(weeks: MyStats["weeks"]): { best: number; average: number } | null {
  if (!weeks.length) return null;
  const places = weeks.map((w) => Number(w.place.replace("*", "")));
  return { best: Math.min(...places), average: places.reduce((a, b) => a + b, 0) / places.length };
}
