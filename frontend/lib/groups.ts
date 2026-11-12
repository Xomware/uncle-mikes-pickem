import type { EntryType, Role } from "@/lib/api/client";

export const groupHref = (groupId: string) => `/group/?id=${encodeURIComponent(groupId)}`;

export const inviteUrl = (origin: string, code: string) => `${origin}/join/?code=${encodeURIComponent(code)}`;

/** The season in progress (Sept to Feb counts as the year it started) and the next one. */
export function seasonOptions(now: Date): [number, number] {
  const year = now.getFullYear();
  const current = now.getMonth() < 2 ? year - 1 : year;
  return [current, current + 1];
}

export const ROLE_LABEL: Record<Role, string> = { owner: "Owner", admin: "Admin", member: "Member" };

export const ENTRY_LABEL: Record<EntryType, string> = { season: "Season", weekly: "Weekly only" };

export const isOrganizer = (role: Role) => role === "owner" || role === "admin";
