import type { LedgerLine, PaymentKind, PaymentMethod } from "@/lib/api/client";

export const paymentNote = (group: string, season: number) => `${group} ${season}`;

export const dollars = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: Number.isInteger(n) ? 0 : 2 });

export const KIND_LABEL: Record<PaymentKind, string> = { weekly: "Weekly pot", yearly: "Yearly pot", death: "Death pool" };

export const lineLabel = (line: LedgerLine) =>
  line.kind === "death" ? `${KIND_LABEL.death} · ${line.label || "Entry"}` : KIND_LABEL[line.kind];

/**
 * A link that opens the method's app with the amount filled in, or null where there is none (Zelle, other,
 * a PayPal email). Venmo's amount/note and Cash App's /amount are community-documented, not official;
 * Cash App has no note param. See docs/features/nfl-data-sources/RESEARCH.md "Payments".
 */
export function payLink(method: PaymentMethod, handle: string, amount: number, note: string): string | null {
  const bare = handle.trim().replace(/^[@$]/, "");
  const plain = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  if (method === "venmo") {
    const query = new URLSearchParams({ txn: "pay", amount: amount.toFixed(2), note });
    return `https://venmo.com/${encodeURIComponent(bare)}?${query}`;
  }
  if (method === "cashapp") return `https://cash.app/$${encodeURIComponent(bare)}/${plain}`;
  if (method === "paypal" && !bare.includes("@")) {
    const user = bare.replace(/^(https?:\/\/)?(www\.)?paypal\.me\//i, "").replace(/\/.*$/, "");
    return `https://paypal.me/${encodeURIComponent(user)}/${plain}`;
  }
  return null;
}
