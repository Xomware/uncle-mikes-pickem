export const gameHref = (groupId: string, gameId: string) =>
  `/game/?groupId=${encodeURIComponent(groupId)}&gameId=${encodeURIComponent(gameId)}`;

export type Severity = "out" | "doubtful" | "questionable" | "ir" | "other";

export function severity(status: string): Severity {
  const s = status.toLowerCase();
  return s === "out" || s === "doubtful" || s === "questionable" || s === "ir" ? s : "other";
}

const SUFFIXES = new Set(["jr.", "jr", "sr.", "sr", "ii", "iii", "iv", "v"]);

/** "Tyrone Tracy Jr." -> "TT": first and last name, ignoring a generational suffix. */
export function initials(name: string): string {
  const words = name.split(/\s+/).filter((w) => w && !SUFFIXES.has(w.toLowerCase()));
  if (words.length === 0) return "";
  const first = words[0][0];
  return words.length === 1 ? first.toUpperCase() : `${first}${words[words.length - 1][0]}`.toUpperCase();
}

export function moneyline(price: number | null | undefined): string | null {
  if (price == null) return null;
  return price > 0 ? `+${price}` : String(price);
}
