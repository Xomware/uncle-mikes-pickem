import type { PaymentMethod, Pots, Rules } from "@/lib/api/client";

// Fees and splits stay strings while editing so a half-typed "6" or "60, 3" isn't coerced.
export interface SettingsForm {
  pickemTie: Rules["pickemTie"];
  deathTie: Rules["deathTie"];
  deathSecondLife: boolean;
  fees: Pots<string>;
  potSplits: Pots<string>;
  payments: { method: PaymentMethod; handle: string }[];
}

export const POTS = ["weekly", "yearly", "death"] as const;

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  venmo: "Venmo",
  zelle: "Zelle",
  cashapp: "Cash App",
  paypal: "PayPal",
  other: "Other",
};

export const MAX_PAYMENTS = 8;

export function toForm(rules: Rules): SettingsForm {
  const map = <A, B>(pots: Pots<A>, fn: (a: A) => B): Pots<B> => ({
    weekly: fn(pots.weekly),
    yearly: fn(pots.yearly),
    death: fn(pots.death),
  });
  return {
    pickemTie: rules.pickemTie,
    deathTie: rules.deathTie,
    deathSecondLife: rules.deathSecondLife,
    fees: map(rules.fees, String),
    potSplits: map(rules.potSplits, (s) => s.join(", ")),
    payments: rules.payments.map((p) => ({ ...p })),
  };
}

export type Errors = Partial<Record<string, string>>;

/** The changed settings, or field errors keyed like "fees.weekly" and "payments.2". */
export function changesFrom(form: SettingsForm, current: Rules): { changes: Partial<Rules> } | { errors: Errors } {
  const errors: Errors = {};
  const fees = {} as Pots<number>;
  const potSplits = {} as Pots<number[]>;

  for (const pot of POTS) {
    const fee = form.fees[pot].trim();
    if (!/^\d+$/.test(fee) || Number(fee) > 10_000) errors[`fees.${pot}`] = "Whole dollars, 0 to 10,000";
    fees[pot] = Number(fee);

    const parts = form.potSplits[pot].split(",").map((p) => p.trim());
    const split = parts.map(Number);
    if (parts.some((p) => !/^\d+$/.test(p)) || split.some((n) => n < 1) || split.length > 10) {
      errors[`potSplits.${pot}`] = "Percent per place, like 60, 30, 10";
    } else if (split.reduce((a, b) => a + b, 0) !== 100) {
      errors[`potSplits.${pot}`] = "Places must add up to 100%";
    }
    potSplits[pot] = split;
  }

  const payments = form.payments.map((p) => ({ method: p.method, handle: p.handle.trim() }));
  payments.forEach((p, i) => {
    if (!p.handle) errors[`payments.${i}`] = "Add a handle, or remove this method";
    else if (p.handle.length > 80) errors[`payments.${i}`] = "80 characters at most";
  });
  if (Object.keys(errors).length) return { errors };

  const next: Partial<Rules> = {
    pickemTie: form.pickemTie,
    deathTie: form.deathTie,
    deathSecondLife: form.deathSecondLife,
    fees,
    potSplits,
    payments,
  };
  // Only what changed, so the version history shows what each save actually did.
  const changes = Object.fromEntries(
    Object.entries(next).filter(([key, value]) => canonical(value) !== canonical(current[key as keyof Rules])),
  );
  return { changes };
}

// DynamoDB maps come back in any key order, so compare with keys sorted.
const canonical = (value: unknown) =>
  JSON.stringify(value, (_, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v,
  );
