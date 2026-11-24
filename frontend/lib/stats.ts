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

/** The `n` teams that earned the most points, and the `n` whose wrong picks cost the most. */
export function teamTrends(teams: TeamRow[], n = 3): { paid: TeamRow[]; cost: TeamRow[] } {
  const top = (key: "won" | "lost") =>
    teams
      .filter((t) => t[key] > 0)
      .sort((a, b) => b[key] - a[key] || decided(b) - decided(a) || a.team.localeCompare(b.team))
      .slice(0, n);
  return { paid: top("won"), cost: top("lost") };
}

/** Best and average weekly place over the weeks graded, missed weeks included. */
export function finishes(weeks: MyStats["weeks"]): { best: number; average: number } | null {
  if (!weeks.length) return null;
  const places = weeks.map((w) => Number(w.place.replace("*", "")));
  return { best: Math.min(...places), average: places.reduce((a, b) => a + b, 0) / places.length };
}
