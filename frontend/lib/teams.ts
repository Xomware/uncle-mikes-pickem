import type { NflTeams, ScheduleGame, TeamRecord, WinLoss } from "@/lib/api/client";
import type { Outcome } from "@/lib/picks";
import { etDate } from "@/lib/time";

/** "2026 season · Mikes · Replay as of Sun, Sep 20 · 1:00 PM ET" */
export const seasonLine = ({ season, replay, now, group }: NflTeams) =>
  [`${season} season`, group?.name, replay && `Replay as of ${etDate(now)}`].filter(Boolean).join(" · ");

/** How a pick on this team's game came out: picking the team is right when it won, picking against it when it lost. */
export function pickOutcome(game: ScheduleGame, abbr: string, picked: string): Outcome {
  if (!game.result || game.result === "T") return null;
  return (game.result === "W") === (picked === abbr) ? "correct" : "wrong";
}

const withGroup = (query: URLSearchParams, groupId?: string | null) => {
  if (groupId) query.set("groupId", groupId);
  return query.toString();
};

export const teamHref = (abbr: string, groupId?: string | null) => `/team/?${withGroup(new URLSearchParams({ team: abbr }), groupId)}`;

export function teamsHref(groupId?: string | null) {
  const qs = withGroup(new URLSearchParams(), groupId);
  return `/teams/${qs ? `?${qs}` : ""}`;
}

/** "9-3", with the tie only when there is one, the way NFL records read. */
export const recordText = (r: WinLoss) => `${r.w}-${r.l}${r.t ? `-${r.t}` : ""}`;

/** Ties count half, as in the NFL standings. 0 before any game. */
export function winPct(r: WinLoss): number {
  const games = r.w + r.l + r.t;
  return games ? (r.w + r.t / 2) / games : 0;
}

/** "-3.5", "+2", or "PK" for a pick'em. */
export function lineText(spread: number | null): string | null {
  if (spread == null) return null;
  if (spread === 0) return "PK";
  return spread > 0 ? `+${spread}` : String(spread);
}

const DIVISION_ORDER = ["East", "North", "South", "West"];

/** AFC then NFC, East to West, each division by win percentage then point differential. */
export function divisions(teams: TeamRecord[]) {
  const rank = (t: TeamRecord) => [winPct(t.overall), t.pointsFor - t.pointsAgainst];
  return ["AFC", "NFC"].flatMap((conference) =>
    DIVISION_ORDER.map((division) => ({
      conference,
      division,
      teams: teams
        .filter((t) => t.conference === conference && t.division === division)
        .sort((a, b) => {
          const [ap, ad] = rank(a);
          const [bp, bd] = rank(b);
          return bp - ap || bd - ad || a.abbr.localeCompare(b.abbr);
        }),
    })),
  );
}
