import { ApiError } from "@/lib/api/client";

// The GOW admin email's links. Both endpoints are public: the signed token is the credential,
// so these calls send no Cognito token and work for an organizer who isn't signed in.

export type GowLinkState = "open" | "used" | "canceled" | "closed";

export interface GowPeek {
  groupId: string;
  groupName: string;
  week: number;
  lockAt: string;
  game: { gameId: string; away: string; home: string; kickoff: string; hype: number | null };
  gow: { gameId: string; chosenBy: string; chosenAt: string } | null;
  state: GowLinkState;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json" },
  });
  const body = (await res.json().catch(() => ({}))) as { data?: T; error?: { message: string } | null };
  if (!res.ok || body.error) throw new ApiError(res.status, body.error?.message ?? `Request failed (${res.status})`);
  return body.data as T;
}

export const peekGow = (token: string) => call<GowPeek>(`/gow/peek?t=${encodeURIComponent(token)}`);

export const confirmGow = (token: string) =>
  call<{ gow: NonNullable<GowPeek["gow"]> }>("/gow/confirm", { method: "POST", body: JSON.stringify({ t: token }) });

/** Why Confirm isn't offered, or null when it is. */
export function blocked(peek: GowPeek): string | null {
  if (peek.state === "closed") return `Week ${peek.week} has locked, so its Game of the Week can't change.`;
  if (peek.state === "used") return "This link was already used. Choose again from the picks page.";
  if (peek.state === "canceled") return "That game is canceled for this group.";
  if (peek.gow?.gameId === peek.game.gameId) return "This is already the Game of the Week.";
  return null;
}
