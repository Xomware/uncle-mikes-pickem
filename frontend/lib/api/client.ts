import { fetchAuthSession } from "aws-amplify/auth";

// Paths are always two levels (/<prefix>/<part>); ids go in the query string or body.

interface Envelope<T> {
  data: T | null;
  error: { message: string; detail?: Record<string, unknown> } | null;
  meta: Record<string, unknown> | null;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  // The ID token, not the access token: only it carries email and name for the
  // Cognito authorizer's claims. Fetched per call; Amplify caches and refreshes it.
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) throw new ApiError(401, "Not signed in");

  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...init,
    // Raw token, no "Bearer " prefix: the shared API module's COGNITO_USER_POOLS
    // authorizer reads the whole header, same as reeses and armchair.
    headers: { "Content-Type": "application/json", Authorization: token },
  });
  // An authorizer rejection is { message }, not the envelope.
  const body = (await res.json().catch(() => ({}))) as Partial<Envelope<T>>;
  if (!res.ok || body.error) {
    throw new ApiError(res.status, body.error?.message ?? `Request failed (${res.status})`, body.error?.detail);
  }
  return body.data as T;
}

export interface Profile {
  sub: string;
  email: string;
  name: string | null;
}

export const getProfile = () => request<Profile>("/me/profile");

const post = <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) });

export type Role = "owner" | "admin" | "member";

export interface GroupSummary {
  groupId: string;
  name: string;
  season: number;
  role: Role;
}

export type EntryType = "weekly" | "season";

export interface Member {
  sub: string;
  name: string;
  role: Role;
  entryType: EntryType;
  joinedWeek: number | null;
}

export type PaymentMethod = "venmo" | "zelle" | "cashapp" | "paypal" | "other";

export interface Pots<T> {
  weekly: T;
  yearly: T;
  death: T;
}

export interface Rules {
  pickemTie: "zero" | "full";
  deathTie: "loss" | "win";
  deathSecondLife: boolean;
  lock: "firstKickoff";
  fees: Pots<number>;
  potSplits: Pots<number[]>;
  payments: { method: PaymentMethod; handle: string }[];
}

export interface GroupDetail {
  group: { groupId: string; name: string; season: number; ownerSub: string };
  role: Role;
  members: Member[];
  rules: Rules;
  rulesVersion: number;
}

export const myGroups = () => request<GroupSummary[]>("/groups/mine");
export const createGroup = (name: string, season: number) => post<GroupSummary>("/groups/create", { name, season });
export const getGroup = (id: string) => request<GroupDetail>(`/groups/get?id=${encodeURIComponent(id)}`);
export const createInvite = (groupId: string) => post<{ code: string; expiresAt: string }>("/invites/create", { groupId });
export const acceptInvite = (code: string, entryType: EntryType) =>
  post<GroupSummary & { joined: boolean }>("/invites/accept", { code, entryType });
