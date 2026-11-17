import { type EntryType, type Pot, type Pots, type Regraded, type Role, type Rules, request } from "@/lib/api/client";
import type { FlagName, Flags } from "@/lib/flags";

// The super admin portal's API. Every /super route answers 404 to anyone else.

export type Job = "cron_tick" | "capture" | "mail_sweep";

export interface Run {
  at: string;
  ok: boolean;
  error: string | null;
  mode: string | null;
}

export interface Overview {
  groups: number;
  users: number;
  perGroup: { groupId: string; name: string; members: number; week: number; submitted: number; complete: number }[];
  jobs: Record<Job, Run | null>;
  errors: { job: Job; at: string; error: string }[];
  mail: { sent24h: number; sent7d: number; sentTotal: number; failed: number };
}

export interface SuperGroupRow {
  groupId: string;
  name: string;
  season: number;
  replay: boolean;
  createdAt: string | null;
  owner: string | null;
  members: number;
}

export interface SuperGroup {
  group: { groupId: string; name: string; season: number; ownerSub: string; createdAt: string | null; replay: boolean | null; clock: string | null };
  members: { sub: string; name: string; role: Role; entryType: EntryType; joinedWeek: number | null; joinedAt: string | null }[];
  rulesVersion: number;
  rules: Rules;
  payments: {
    owed: number;
    paid: number;
    pots: Pots<Pot>;
    members: { sub: string; name: string; owed: number; paid: number; balance: number }[];
  };
  death: { alive: number; entries: { label: string; owner: string | null; livesLeft: number; eliminatedWeek: number | null }[] };
  flags: Record<string, boolean | string>;
}

export interface SuperUser {
  sub: string;
  email: string | null;
  name: string | null;
  createdAt: string | null;
  lastSeen: string | null;
  groups: { groupId: string; name: string; season: number; role: Role }[];
}

export const getOverview = () => request<Overview>("/super/overview");
export const getSuperGroups = () => request<SuperGroupRow[]>("/super/groups");
export const getSuperGroup = (id: string) => request<SuperGroup>(`/super/group?id=${encodeURIComponent(id)}`);
export const getSuperUsers = () => request<SuperUser[]>("/super/users");

const post = <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) });

/** Stored overrides only: a name missing from a map inherits. */
export type Overrides = Partial<Flags>;

export interface FlagsView {
  defaults: Flags;
  global: Overrides;
  groups: { groupId: string; name: string; flags: Overrides }[];
}

export interface MailClaim {
  sub: string;
  groupId: string;
  eventId: string;
  status: "sent" | "failed";
  at: string;
}

export interface MailEvent {
  at: string;
  type: string;
  groupId: string;
  season: number;
  week: number;
  eventId: string;
}

export type JobName = "tick" | "capture" | "replay-load" | "sweep";

export const getSuperFlags = () => request<FlagsView>("/super/flags");
/** scope is "global" or a group id. null drops that override. */
export const setSuperFlags = (scope: string, flags: Partial<Record<FlagName, boolean | string | null>>) =>
  post<{ scope: string; flags: Overrides }>("/super/flags-set", { scope, flags });
export const getEmails = (groupId?: string) =>
  request<{ claims: MailClaim[]; events: MailEvent[] }>(`/super/emails${groupId ? `?groupId=${encodeURIComponent(groupId)}` : ""}`);
export const runJob = (job: JobName, payload: Record<string, unknown>) =>
  post<{ job: JobName; function: string }>("/super/cron", { job, payload });
export const superRegrade = (groupId: string, week?: number) => post<Regraded>("/super/regrade", { groupId, week });

type Toggle = Exclude<FlagName, "maintenanceBanner">;

// global: the flag acts before any group exists, so a group override would do nothing.
export const FLAG_INFO: { name: Toggle; label: string; hint: string; email?: true; global?: true }[] = [
  { name: "deathPool", label: "Death pool", hint: "Survivor entries, picks and the board" },
  { name: "payments", label: "Payments", hint: "The ledger, pay page and marking paid" },
  { name: "gameInfo", label: "Game info", hint: "Lines, injuries and weather per game" },
  { name: "filmRoom", label: "Film room", hint: "AI write-ups" },
  { name: "analytics", label: "Analytics", hint: "Win odds, rooting guide, pick breakdowns" },
  { name: "payouts", label: "Payouts", hint: "Who won what from the pots" },
  { name: "printableSheets", label: "Printable sheets", hint: "Week, group and standings sheets" },
  { name: "replayGroups", label: "Replay groups", hint: "Creating 2026 replay groups", global: true },
  { name: "groupCreation", label: "Group creation", hint: "Off: only you can start groups", global: true },
  { name: "emailResults", label: "Results", hint: "Week results and corrections", email: true },
  { name: "emailReminders", label: "Reminders", hint: "Late-pick reminders and GOW-set notices", email: true },
  { name: "emailDeath", label: "Death pool", hint: "Eliminations, lost lives, revives", email: true },
  { name: "emailGowAdmin", label: "GOW admin", hint: "The organizer's pick-the-GOW email", email: true },
  { name: "emailAnnouncements", label: "Announcements", hint: "Site-wide announcements", email: true },
];

/** What a flag resolves to at a scope: the stored override, else the global one, else the default. */
export function resolve(view: FlagsView, name: FlagName, groupId?: string) {
  const group = view.groups.find((g) => g.groupId === groupId)?.flags ?? {};
  return group[name] ?? view.global[name] ?? view.defaults[name];
}

export const JOB_LABEL: Record<Job, string> = { cron_tick: "Scores tick", capture: "ESPN capture", mail_sweep: "Mail sweep" };

const HOUR = 3_600_000;
// How long each job can go quiet before it's late. cron_tick runs at least hourly, capture
// daily at 14:00 UTC, the sweep every 10 minutes. Twice that, or an error, is red.
const LATE_AFTER: Record<Job, number> = { cron_tick: 2 * HOUR, capture: 26 * HOUR, mail_sweep: HOUR / 2 };

export type Health = "green" | "amber" | "red";

export function jobHealth(job: Job, run: Run | null, now: Date): Health {
  if (!run) return "amber";
  if (!run.ok) return "red";
  const age = now.getTime() - new Date(run.at).getTime();
  if (age > 2 * LATE_AFTER[job]) return "red";
  return age > LATE_AFTER[job] ? "amber" : "green";
}

/** "4m ago", "3h ago", "2d ago". */
export function ago(at: string, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(at).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / 1440)}d ago`;
}

/** Case-insensitive match on any of the given fields. */
export function matches(query: string, ...fields: (string | null | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  return !q || fields.some((f) => f?.toLowerCase().includes(q));
}
