import { type EntryType, type Pot, type Pots, type Role, type Rules, request } from "@/lib/api/client";

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
