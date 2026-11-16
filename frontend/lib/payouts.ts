import type { Payout, Payouts } from "@/lib/api/client";
import { dollars } from "@/lib/payments";

export const cents = (n: number) => dollars(n / 100);

export const STATUS_LABEL: Record<Payouts["weeks"][number]["status"], string> = {
  open: "In play",
  provisional: "Provisional",
  final: "Final",
};

/** Payouts for one pot, and for weekly, one week. */
export const linesFor = (book: Payouts, pot: Payout["pot"], week: number | null = null) =>
  book.payouts.filter((p) => p.pot === pot && p.week === week);

/** Paid out to weekly winners so far, counting settled weeks only. */
export const weeklyPaid = (book: Payouts) =>
  book.payouts.filter((p) => p.pot === "weekly" && p.final).reduce((n, p) => n + p.amount, 0);

export function deathStatus({ death }: Payouts, names: Map<string, string>): string {
  if (!death.entries) return "No entries";
  if (!death.decided) return `${death.alive} of ${death.entries} alive`;
  // A $0 pot pays nobody, so the winner's name may not be on any payout line; the entry label stands in.
  const who = [...new Set(death.winners.map((w) => names.get(w.sub) ?? w.label ?? "an entry"))];
  return death.winners.length === 1 ? `Won by ${who[0]}` : `Split by ${who.join(", ")}`;
}

export function seasonStatus({ season }: Payouts): string {
  if (season.final) return "Final";
  return season.throughWeek ? `Projected · ${cents(season.accrued)} in so far` : "Projected";
}
