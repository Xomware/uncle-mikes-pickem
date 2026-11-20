import type { WeekView } from "@/lib/api/client";

export type SheetState = "missed" | "in" | "none" | "draft" | "done";

/** Where the caller's sheet stands this week, and how many open games it has a team for. */
export function sheetStatus(view: WeekView): { state: SheetState; label: string } {
  const open = view.games.filter((g) => !g.canceled).length;
  const mine = view.mine;
  const picked = Object.values(mine?.picks ?? {}).filter((p) => p.team).length;
  if (view.week.locked) {
    return mine?.complete ? { state: "in", label: "Locked in" } : { state: "missed", label: "No sheet at lock" };
  }
  if (!mine || picked === 0) return { state: "none", label: "Not started" };
  if (!mine.complete) return { state: "draft", label: `${picked} of ${open} picked` };
  return { state: "done", label: "Sheet in" };
}

/**
 * Weeks to look in, newest first, for the latest weekly winner. A locked week may still be in play,
 * so the week before it is the fallback.
 */
export function winnerWeeks({ week }: WeekView): number[] {
  const newest = week.locked ? week.week : week.week - 1;
  return [newest, newest - 1].filter((w) => w >= 1);
}
