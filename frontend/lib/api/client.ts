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
  /** Replay groups only: the virtual clock and each week's lock, keyed by week number. */
  replay: { clock: string; lockAts: Record<string, string> } | null;
}

export type PaymentKind = "weekly" | "yearly" | "death";

export interface LedgerLine {
  kind: PaymentKind;
  owed: number;
  paid: boolean;
  entryId?: string;
  label?: string | null;
  amount?: number;
  method?: PaymentMethod;
  paidOn?: string;
}

export interface LedgerRow {
  sub: string;
  name: string;
  entryType: EntryType;
  lines: LedgerLine[];
  owed: number;
  paid: number;
  balance: number;
}

export interface Pot {
  entries: number;
  total: number;
  collected: number;
  payouts: number[];
}

/** members holds only the caller's row unless the caller is an organizer. */
export interface Ledger {
  group: { groupId: string; name: string; season: number };
  role: Role;
  fees: Pots<number>;
  methods: Rules["payments"];
  members: LedgerRow[];
  pots: Pots<Pot>;
}

export const myGroups = () => request<GroupSummary[]>("/groups/mine");
export const createGroup = (name: string, season: number, replay: boolean) =>
  post<GroupSummary>("/groups/create", { name, season, replay });
export const getGroup = (id: string) => request<GroupDetail>(`/groups/get?id=${encodeURIComponent(id)}`);
export const createInvite = (groupId: string) => post<{ code: string; expiresAt: string }>("/invites/create", { groupId });
export const updateRules = (groupId: string, changes: Partial<Rules>) =>
  post<{ rules: Rules; version: number; effectiveWeek: number }>("/rules/update", { groupId, changes });
export const acceptInvite = (code: string, entryType: EntryType) =>
  post<GroupSummary & { joined: boolean }>("/invites/accept", { code, entryType });

export interface Team {
  abbr: string;
}

export interface Game {
  gameId: string;
  kickoff: string;
  away: Team;
  home: Team;
  lines: { spread: number | null; overUnder: number | null; details: string | null } | null;
  broadcasts: string[] | null;
  state: "pre" | "in" | "post" | null;
  completed: boolean | null;
  // Set once the game is final (F7): the winning team's abbr, or "TIE".
  winner: string | null;
  canceled: boolean;
}

export interface PickEntry {
  team: string | null;
  conf: number;
}

export interface WeekPicks {
  sub: string;
  picks: Record<string, PickEntry>;
  tiebreak: number | null;
  complete: boolean;
  submittedAt: string;
}

export interface Gow {
  gameId: string;
  chosenBy: string;
  chosenAt: string;
}

export interface WeekView {
  group: { groupId: string; name: string; season: number };
  role: Role;
  week: { season: number; week: number; lockAt: string; tiebreakGameId: string; locked: boolean; now: string };
  games: Game[];
  gow: Gow | null;
  mine: WeekPicks | null;
  members: { sub: string; name: string }[];
  // Everyone's picks; the API sends them only after lock.
  picks: WeekPicks[];
}

export const getWeek = (groupId: string, week?: number) =>
  request<WeekView>(`/picks/get?groupId=${encodeURIComponent(groupId)}${week ? `&week=${week}` : ""}`);
export const setPicks = (groupId: string, week: number, picks: Record<string, PickEntry>, tiebreak: number | null) =>
  post<{ pick: WeekPicks }>("/picks/set", { groupId, week, picks, tiebreak });
export const setGow = (groupId: string, week: number, gameId: string) =>
  post<{ gow: Gow }>("/gow/set", { groupId, week, gameId });
export const cancelGame = (groupId: string, week: number, gameId: string, canceled: boolean) =>
  post<{ canceled: string[] }>("/games/cancel", { groupId, week, gameId, canceled });
export interface DeathGame {
  gameId: string;
  kickoff: string;
  away: string;
  home: string;
  /** The home team's line, negative when home is favored. */
  spread: number | null;
  details: string | null;
}

export interface DeathEntry {
  entryId: string;
  label: string;
  ownerSub: string;
  ownerName: string;
  mine: boolean;
  /** Week number to team. null is another entry's pick, hidden until that week locks. */
  picks: Record<string, string | null>;
  used: string[];
  livesLeft: number;
  status: "alive" | "eliminated";
  eliminatedWeek: number | null;
}

export interface DeathBoard {
  season: number;
  startLives: number;
  week: { number: number; lockAt: string; locked: boolean; games: DeathGame[] } | null;
  entries: DeathEntry[];
}

export const getDeathBoard = (groupId: string) =>
  request<DeathBoard>(`/death/board?id=${encodeURIComponent(groupId)}`);
export const addDeathEntry = (groupId: string, label?: string, sub?: string) =>
  post<{ entryId: string; ownerSub: string; label: string }>("/death/entry", { groupId, label, sub });
export const setDeathPick = (groupId: string, entryId: string, week: number, team: string) =>
  post<{ entryId: string; label: string; picks: Record<string, string> }>("/death/pick", { groupId, entryId, week, team });

// Grading (F7) and standings (F8) are being built alongside these sheets. The shapes below
// mirror common/standings.py's week_board and season rows, plus the member's name.
export interface WeekResultRow {
  sub: string;
  name: string;
  weekly: number;
  yearly: number;
  gow: number;
  missed: boolean;
  /** "1", or "1*" for a shared place. */
  place: string;
}

export interface WeekResult {
  season: number;
  week: number;
  /** A game is final on ESPN but not yet confirmed by nflverse. */
  provisional: boolean;
  /** The tiebreak game's total points once it is final. */
  tiebreakTotal: number | null;
  /** Payout winners' subs: several on an exact tiebreak tie. */
  winners: string[];
  rows: WeekResultRow[];
}

export interface SeasonRow {
  sub: string;
  name: string;
  place: string;
  total: number;
  gow: number;
  /** Week number to that week's yearly score. */
  weeks: Record<string, number>;
}

export interface SeasonStandings {
  season: number;
  throughWeek: number;
  rows: SeasonRow[];
}

export const getWeekResult = (groupId: string, week: number) =>
  request<WeekResult>(`/results/week?groupId=${encodeURIComponent(groupId)}&week=${week}`);
export const getSeasonStandings = (groupId: string) =>
  request<SeasonStandings>(`/standings/season?groupId=${encodeURIComponent(groupId)}`);

/** null for a 404: nothing graded yet, or the endpoint isn't deployed. */
export const unlessMissing = <T>(pending: Promise<T>): Promise<T | null> =>
  pending.catch((err: unknown) => {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  });

export const advanceReplay =(groupId: string, to: string) =>
  post<{ groupId: string; clock: string }>("/replay/advance", { groupId, to });

export const getLedger = (id: string) => request<Ledger>(`/payments/ledger?id=${encodeURIComponent(id)}`);

export interface Mark {
  groupId: string;
  sub: string;
  kind: PaymentKind;
  entryId?: string;
  paid: boolean;
  amount?: number;
  method?: PaymentMethod;
  paidOn?: string;
}

export const markPayment = (mark: Mark) => post<Omit<Mark, "groupId">>("/payments/mark", mark);

export type EmailType = "results" | "reminders" | "death" | "gowAdmin";
export type EmailPrefs = Record<EmailType, boolean>;

export interface EmailSettings {
  address: string;
  // SES reported the address as bouncing or complaining; no toggle will reach it.
  suppressed: boolean;
  types: Record<EmailType, string>;
  groups: { groupId: string; name: string; season: number; role: Role; prefs: EmailPrefs }[];
}

export const getEmailPrefs = () => request<EmailSettings>("/email/prefs");
export const setEmailPrefs = (groupId: string, prefs: Partial<EmailPrefs>) =>
  post<{ groupId: string; prefs: EmailPrefs }>("/email/prefs-set", { groupId, prefs });
export const sendTestEmail = (groupId: string) => post<{ to: string; subject: string }>("/email/test", { groupId });
