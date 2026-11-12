// Kickoffs and locks read in Eastern for everyone, the way the NFL lists them, so a
// member travelling or on a UTC device sees the same "Sun 1:00 PM" as the group chat.
const ET = "America/New_York";

/** "Sun 1:00 PM ET" */
export const etTime = (iso: string) =>
  `${new Date(iso).toLocaleString("en-US", { timeZone: ET, weekday: "short", hour: "numeric", minute: "2-digit" })} ET`;
