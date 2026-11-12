import type { GameGrade } from "@/lib/api/client";
import type { Outcome } from "@/lib/picks";

export const standingsHref = (groupId: string) => `/group/standings/?id=${encodeURIComponent(groupId)}`;

/** The grid's green or red for a graded pick. A tie, a void and a pending game stay unmarked. */
export const gradeMark = (grade: GameGrade | undefined): Outcome =>
  grade === "right" ? "correct" : grade === "wrong" ? "wrong" : null;
