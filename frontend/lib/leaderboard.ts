import type { LeaderBoard, LeaderRow } from "@/lib/api/client";

export const graded = (r: LeaderRow) => r.correct + r.wrong + r.ties;

export function pickPct(r: LeaderRow): string {
  const n = graded(r);
  return n ? `${((100 * r.correct) / n).toFixed(1)}%` : "-";
}

export const record = (r: LeaderRow) => `${r.correct}-${r.wrong}` + (r.ties ? `-${r.ties}` : "");

/** The caller's row when it falls below the first page, to pin under it. */
export const pinnedMe = (board: LeaderBoard) => (board.me && !board.rows.some((r) => r.you) ? board.me : null);
