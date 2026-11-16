// Kickoffs and locks read in Eastern for everyone, the way the NFL lists them, so a
// member travelling or on a UTC device sees the same "Sun 1:00 PM" as the group chat.
const ET = "America/New_York";

/** "Thu, Nov 12 · 8:15 PM ET" */
export function etDate(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-US", { timeZone: ET, weekday: "short", month: "short", day: "numeric" });
  const time = d.toLocaleTimeString("en-US", { timeZone: ET, hour: "numeric", minute: "2-digit" });
  return `${day} · ${time} ET`;
}

/** "Sun 1:00 PM ET" */
export const etTime = (iso: string) =>
  `${new Date(iso).toLocaleString("en-US", { timeZone: ET, weekday: "short", hour: "numeric", minute: "2-digit" })} ET`;
