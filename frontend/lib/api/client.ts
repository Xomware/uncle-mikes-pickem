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
  /** perWeek: weekly and yearly fees are owed for every week played. perSeason: once. */
  feeBasis: FeeBasis;
  potSplits: Pots<number[]>;
  payments: { method: PaymentMethod; handle: string }[];
}

export type FeeBasis = "perWeek" | "perSeason";

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
  /** amount covers owed. A perWeek fee paid through an earlier week has an amount but isn't paid. */
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
  /** The latest locked week; perWeek fees are owed through it. 0 before Week 1 locks. */
  owedThrough: number;
  feeBasis: FeeBasis;
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
  // ESPN's logo URL and hex colors (no '#'). Missing on rows written before F14.3.
  logo?: string | null;
  color?: string | null;
  alternateColor?: string | null;
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

/** What a regrade rewrote: the weeks whose RESULT changed, the season table, newly eliminated death entries. */
export interface Regraded {
  weeks: number[];
  standings: boolean;
  eliminated: string[];
}

/** Regrades one week, or every locked week when week is left out. Organizer. */
export const regrade = (groupId: string, week?: number) => post<Regraded>("/results/regrade", { groupId, week });
/** Null scores clear the override. Organizer. */
export const overrideScore = (groupId: string, week: number, gameId: string, awayScore: number | null, homeScore: number | null) =>
  post<Regraded>("/results/override", { groupId, week, gameId, awayScore, homeScore });

export interface Injury {
  name: string;
  position: string | null;
  /** Out, Doubtful, Questionable, IR, or whatever else ESPN sends. */
  status: string;
  detail: string | null;
  returnDate: string | null;
  headshot: string;
}

export interface InfoTeam extends Team {
  name?: string | null;
  record?: string | null;
  /** Home record for the home team, road record for the away team. */
  split?: string | null;
  form: { week: number; atVs: string; opponent: string; result: "W" | "L" | "T"; score: string }[];
  injuries: Injury[];
}

export interface GameInfo {
  game: {
    gameId: string;
    week: number;
    kickoff: string;
    timeValid: boolean | null;
    state: "pre" | "in" | "post" | null;
    completed: boolean | null;
    awayScore: number | null;
    homeScore: number | null;
    winner: string | null;
    lines: {
      provider?: string | null;
      details?: string | null;
      spread?: number | null;
      overUnder?: number | null;
      homeMoneyline?: number | null;
      awayMoneyline?: number | null;
    } | null;
    broadcasts: string[];
    venue: { name?: string | null; city?: string | null; state?: string | null; roof: string | null };
  };
  away: InfoTeam;
  home: InfoTeam;
  /** null indoors, or when ESPN has no forecast. Precipitation is probably percent chance (unverified). */
  weather: {
    temperature?: number | null;
    high?: number | null;
    low?: number | null;
    gust?: number | null;
    precipitation?: number | null;
    description?: string | null;
  } | null;
  headToHead: { season: number; week: number; gameType: string; kickoff: string; away: string; home: string; awayScore: number; homeScore: number }[];
  /** capture: a replay group's snapshot; none: no snapshot yet, so injuries, form and weather are empty. */
  source: { kind: "espn" | "capture" | "none"; at: string | null; note?: string };
  /** The Film Room preview, written by Claude before kickoff. null until the Wednesday run. */
  writeup: { text: string; model: string; generatedAt: string } | null;
}

export const getGameInfo = (groupId: string, gameId: string) =>
  request<GameInfo>(`/games/info?groupId=${encodeURIComponent(groupId)}&gameId=${encodeURIComponent(gameId)}`);

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

/** A member's grade on one game: tie is a tie under the zero rule, void a game canceled after lock. */
export type GameGrade = "right" | "wrong" | "void" | "tie" | "pending";

export interface ResultMember {
  sub: string;
  name: string;
  entryType: EntryType;
  weekly: number;
  yearly: number;
  gow: number;
  /** No complete sheet at lock: scored as the lowest submitter minus 1. */
  missed: boolean;
  /** "1"; "1*" marks the MNF tiebreak winner when the top score was shared. Ties otherwise share the number. */
  place: string;
  games: Record<string, GameGrade>;
}

export interface GameFinal {
  awayScore: number;
  homeScore: number;
  /** The winning team's abbr, or "tie". */
  result: string;
  confirmed: boolean;
}

export interface WeekResult {
  groupId: string;
  season: number;
  week: number;
  /** open while a game is unfinished, provisional until nflverse confirms every final. */
  status: "open" | "provisional" | "final";
  gradedAt: string;
  rulesVersion: number;
  gowGameId: string | null;
  tiebreakGameId: string;
  tiebreakTotal: number | null;
  canceled: string[];
  /** null while the game is unfinished; canceled games are left out. */
  games: Record<string, GameFinal | null>;
  /** Weekly payout winners' subs: top score, then the MNF tiebreak. Several on an exact tie. */
  winners: string[];
  /** Highest weekly score first. Weekly-only members included. */
  members: ResultMember[];
}

export interface SeasonRow {
  member: string;
  name: string;
  total: number;
  gow: number;
  place: string;
  /** Week number to that week's yearly score. */
  weeks: Record<string, number | null>;
}

/** Season members only; rows is empty until a week is graded. */
export interface SeasonStandings {
  groupId: string;
  season: number;
  throughWeek: number;
  final: boolean;
  rows: SeasonRow[];
}

export const getWeekResult = (groupId: string, week: number) =>
  request<WeekResult>(`/results/week?groupId=${encodeURIComponent(groupId)}&week=${week}`);
export const getSeasonStandings = (groupId: string) =>
  request<SeasonStandings>(`/standings/season?id=${encodeURIComponent(groupId)}`);

/** P(this member wins the week) if the away side wins the game, and if home does. null: that side can't win. */
export interface RootSplit {
  away: number | null;
  home: number | null;
}

export interface WeekOdds {
  groupId: string;
  season: number;
  week: number;
  status: WeekResult["status"];
  sims: number;
  computedAt: string;
  /** Undecided games only. */
  games: Record<string, { pHome: number; source: "moneyline" | "spread" | "even" }>;
  /** Most likely first. A member with no sheet has pWin 0 and no rooting guide. */
  members: { sub: string; name: string; pWin: number; root: Record<string, RootSplit> }[];
}

/** Season members only; members is empty until a week is graded. */
export interface SeasonOdds {
  groupId: string;
  season: number;
  throughWeek: number;
  sims: number;
  computedAt: string | null;
  members: { sub: string; name: string; pWin: number; mean: number; sd: number }[];
}

export const getWeekOdds = (groupId: string, week: number) =>
  request<WeekOdds>(`/analytics/week?groupId=${encodeURIComponent(groupId)}&week=${week}`);
export const getSeasonOdds = (groupId: string) => request<SeasonOdds>(`/analytics/season?id=${encodeURIComponent(groupId)}`);

/** null for a 404: the week isn't graded yet. */
export const unlessMissing = <T>(pending: Promise<T>): Promise<T | null> =>
  pending.catch((err: unknown) => {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  });

export const advanceReplay = (groupId: string, to: string) =>
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

/** One winner's share of one pot. Amounts in this block are cents. */
export interface Payout {
  pot: PaymentKind;
  /** Weekly payouts only. */
  week: number | null;
  sub: string;
  name: string;
  amount: number;
  /** The result behind it can't change any more: a final week or season table, a decided death pool. */
  final: boolean;
  sent: boolean;
}

export interface PayoutTotal {
  sub: string;
  name: string;
  won: number;
  pending: number;
  sent: number;
}

/** Visible to every member. */
export interface Payouts {
  group: { groupId: string; name: string; season: number };
  role: Role;
  throughWeek: number;
  weeks: { week: number; status: WeekResult["status"]; pot: number; winners: string[] }[];
  /** pot is projected through Week 18; accrued is what Weeks 1..throughWeek have added. */
  season: { pot: number; accrued: number; final: boolean; throughWeek: number };
  death: {
    pot: number;
    entries: number;
    alive: number;
    decided: boolean;
    winners: { entryId: string; label: string | null; sub: string }[];
  };
  payouts: Payout[];
  members: PayoutTotal[];
}

export const getPayouts = (id: string) => request<Payouts>(`/payments/payouts?id=${encodeURIComponent(id)}`);

export interface PayoutMark {
  groupId: string;
  sub: string;
  pot: PaymentKind;
  week?: number;
  sent: boolean;
  method?: PaymentMethod;
  sentOn?: string;
}

export const markPayout = (mark: PayoutMark) => post<Omit<PayoutMark, "groupId">>("/payments/payout-mark", mark);

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

export interface GradeTally {
  right: number;
  wrong: number;
  tie: number;
}

/** The caller's season in one group. Void and pending games count for nothing. */
export interface MyStats {
  group: { groupId: string; name: string; season: number };
  entryType: EntryType;
  throughWeek: number;
  /** null for a weekly-only member, or before Week 1 is graded. */
  season: { place: string; total: number; gow: number } | null;
  /** Cents. null while payouts are off for the group. pending is won on a result that can still change. */
  money: { won: number; pending: number } | null;
  /** field is how many members the week graded. */
  weeks: { week: number; status: WeekResult["status"]; weekly: number; place: string; field: number; missed: boolean; won: boolean }[];
  record: GradeTally;
  points: { earned: number; possible: number };
  /** Right picks in a row, in kickoff order. */
  streak: { longest: number; current: number };
  gow: GradeTally;
  /** The caller's record picking each team. */
  teams: (GradeTally & { team: string })[];
}

export const getMyStats = (id: string) => request<MyStats>(`/me/stats?id=${encodeURIComponent(id)}`);
