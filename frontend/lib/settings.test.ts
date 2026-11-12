import { describe, expect, it } from "vitest";

import type { Rules } from "@/lib/api/client";

import { changesFrom, toForm } from "./settings";

const RULES: Rules = {
  pickemTie: "zero",
  deathTie: "loss",
  deathSecondLife: false,
  lock: "firstKickoff",
  fees: { weekly: 10, yearly: 100, death: 20 },
  potSplits: { weekly: [100], yearly: [60, 30, 10], death: [100] },
  payments: [{ method: "venmo", handle: "@organizer" }],
};

describe("settings form", () => {
  it("sends nothing when nothing changed, whatever order the API returned keys in", () => {
    const reordered = { ...RULES, fees: { death: 20, yearly: 100, weekly: 10 } };
    expect(changesFrom(toForm(RULES), reordered)).toEqual({ changes: {} });
  });

  it("sends only the changed settings, parsed", () => {
    const form = toForm(RULES);
    form.fees.weekly = " 15 ";
    form.potSplits.yearly = "50,30 , 20";
    form.payments.push({ method: "other", handle: "  Apple Cash 555-0100 " });

    expect(changesFrom(form, RULES)).toEqual({
      changes: {
        fees: { weekly: 15, yearly: 100, death: 20 },
        potSplits: { weekly: [100], yearly: [50, 30, 20], death: [100] },
        payments: [
          { method: "venmo", handle: "@organizer" },
          { method: "other", handle: "Apple Cash 555-0100" },
        ],
      },
    });
  });

  it("reports field errors instead of changes", () => {
    const form = toForm(RULES);
    form.fees.death = "12.50";
    form.potSplits.yearly = "60, 30";
    form.potSplits.weekly = "100, 0";
    form.payments[0].handle = " ";

    expect(changesFrom(form, RULES)).toEqual({
      errors: {
        "fees.death": "Whole dollars, 0 to 10,000",
        "potSplits.yearly": "Places must add up to 100%",
        "potSplits.weekly": "Percent per place, like 60, 30, 10",
        "payments.0": "Add a handle, or remove this method",
      },
    });
  });
});
