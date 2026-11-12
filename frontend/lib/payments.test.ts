import { describe, expect, it } from "vitest";

import { dollars, payLink, paymentNote } from "./payments";

const note = paymentNote("Sunday Crew", 2027);

describe("payLink", () => {
  it("prefills Venmo with amount and note, dropping the @", () => {
    const url = new URL(payLink("venmo", " @dom-g ", 110, note)!);
    expect(url.origin + url.pathname).toBe("https://venmo.com/dom-g");
    expect(url.searchParams.get("txn")).toBe("pay");
    expect(url.searchParams.get("amount")).toBe("110.00");
    expect(url.searchParams.get("note")).toBe("Sunday Crew 2027");
  });

  it("puts the amount in the Cash App path, with or without the $", () => {
    expect(payLink("cashapp", "$domg", 30, note)).toBe("https://cash.app/$domg/30");
    expect(payLink("cashapp", "domg", 12.5, note)).toBe("https://cash.app/$domg/12.50");
  });

  it("builds PayPal.me from a bare name or a pasted link, but not an email", () => {
    expect(payLink("paypal", "domg", 20, note)).toBe("https://paypal.me/domg/20");
    expect(payLink("paypal", "https://www.paypal.me/domg/", 20, note)).toBe("https://paypal.me/domg/20");
    expect(payLink("paypal", "paypal.me/domg", 20, note)).toBe("https://paypal.me/domg/20");
    expect(payLink("paypal", "dom@example.com", 20, note)).toBeNull();
  });

  it("has no link for Zelle or other", () => {
    expect(payLink("zelle", "555-123-4567", 20, note)).toBeNull();
    expect(payLink("other", "Cash at the bar", 20, note)).toBeNull();
  });
});

describe("dollars", () => {
  it("shows cents only when there are some", () => {
    expect(dollars(110)).toBe("$110");
    expect(dollars(33.3)).toBe("$33.30");
    expect(dollars(1500)).toBe("$1,500");
  });
});
