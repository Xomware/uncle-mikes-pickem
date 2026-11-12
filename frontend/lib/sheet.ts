import type { Game } from "@/lib/api/client";

// The paper sheet is written in Eastern time: "Sunday night" means 8:20 PM ET wherever you live.
const ZONE = "America/New_York";

// ESPN abbreviations.
const TEAMS = [
  "ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN", "DET", "GB", "HOU", "IND", "JAX", "KC",
  "LAC", "LAR", "LV", "MIA", "MIN", "NE", "NO", "NYG", "NYJ", "PHI", "PIT", "SEA", "SF", "TB", "TEN", "WSH",
];

const eastern = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONE,
  weekday: "short",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hourCycle: "h23",
});

function et(iso: string) {
  const parts = Object.fromEntries(eastern.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return { weekday: parts.weekday, date: `${parts.month}/${parts.day}`, hour: Number(parts.hour), minute: parts.minute };
}

const WEEKDAY: Record<string, string> = {
  Mon: "MONDAY", Tue: "TUESDAY", Wed: "WEDNESDAY", Thu: "THURSDAY", Fri: "FRIDAY", Sat: "SATURDAY", Sun: "SUNDAY",
};

/** The paper's slot header for one game, singular: "SUNDAY NIGHT GAME". */
export function slotName(game: Game): string {
  const { weekday, hour } = et(game.kickoff);
  if (weekday === "Sun") {
    // Nothing kicks off before 1 PM ET on a Sunday except London, Munich and the other overseas games.
    if (hour < 13) return "INTERNATIONAL GAME";
    return hour >= 20 ? "SUNDAY NIGHT GAME" : "SUNDAY GAME";
  }
  return weekday === "Mon" ? "MONDAY NIGHT GAME" : `${WEEKDAY[weekday]} GAME`;
}

export const GOW_LABEL = "GAME OF THE WEEK";

export const sheetHref = (groupId: string, week: number, all = false) =>
  `/group/sheet/?id=${encodeURIComponent(groupId)}&week=${week}${all ? "&all=1" : ""}`;

export interface Slot {
  label: string;
  gow: boolean;
  games: Game[];
}

/**
 * Games grouped the way the paper sheet lists them, in kickoff order. The GOW comes out of its
 * slot into its own, placed just ahead of the slot it left.
 */
export function slots(games: Game[], gowId: string | null): Slot[] {
  const sorted = [...games].sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.gameId.localeCompare(b.gameId));
  const out: Slot[] = [];
  for (const game of sorted) {
    if (game.gameId === gowId) continue;
    const label = slotName(game);
    const last = out.at(-1);
    if (last?.label === label) last.games.push(game);
    else out.push({ label, gow: false, games: [game] });
  }
  const gow = sorted.find((g) => g.gameId === gowId);
  if (gow) {
    const home = out.findIndex((s) => s.label === slotName(gow));
    const later = out.findIndex((s) => s.games[0].kickoff > gow.kickoff);
    const at = home >= 0 ? home : later >= 0 ? later : out.length;
    out.splice(at, 0, { label: GOW_LABEL, gow: true, games: [gow] });
  }
  return out.map((s) => (s.games.length > 1 ? { ...s, label: `${s.label}S` } : s));
}

/** "11/12, 11/15, 11/16": each game day, Eastern time. */
export const gameDates = (games: Game[]) =>
  [...new Set([...games].sort((a, b) => a.kickoff.localeCompare(b.kickoff)).map((g) => et(g.kickoff).date))].join(", ");

export function byeTeams(games: Game[]): string[] {
  const playing = new Set(games.flatMap((g) => [g.away.abbr, g.home.abbr]));
  return TEAMS.filter((t) => !playing.has(t));
}

/** "THU 11/12 8:15 PM ET" */
export function easternTime(iso: string): string {
  const { weekday, date, hour, minute } = et(iso);
  return `${weekday.toUpperCase()} ${date} ${hour % 12 || 12}:${minute} ${hour < 12 ? "AM" : "PM"} ET`;
}
