import type { Slate, SlateGroup } from "@/lib/api/client";
import { isOrganizer } from "@/lib/groups";
import { pickStatus } from "@/lib/home";

export type Banner =
  | { kind: "gow"; groupId: string; group: string; week: number; due: string }
  | { kind: "picks"; groupId: string; group: string; week: number; lockAt: string; progress: string };

// The sheet isn't complete, so every team picked still leaves points or the tiebreak to do.
function progress(group: SlateGroup, games: number) {
  const { label, done } = pickStatus(group, games);
  return done ? "Points or tiebreak missing" : label;
}

/**
 * What the caller still has to do this week, most urgent first: an organizer's GOW
 * (it has the earlier deadline), then sheets that aren't complete. Replay groups run
 * on their own clock, so they never show here.
 */
export function banners(slate: Slate, now: number): Banner[] {
  const { week, lockAt, gowDeadline } = slate;
  if (slate.archived || slate.week !== slate.currentWeek || !lockAt || now >= Date.parse(lockAt)) return [];
  const live = slate.groups.filter((g) => !g.replay);
  const gow: Banner[] = live
    .filter((g) => isOrganizer(g.role) && !g.gow && gowDeadline && now < Date.parse(gowDeadline))
    .map((g) => ({ kind: "gow", groupId: g.groupId, group: g.name, week, due: gowDeadline! }));
  const picks: Banner[] = live
    .filter((g) => g.gow && !g.complete)
    .map((g) => ({ kind: "picks", groupId: g.groupId, group: g.name, week, lockAt, progress: progress(g, slate.games.length) }));
  return [...gow, ...picks];
}
