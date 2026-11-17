import { describe, expect, it } from "vitest";

import { endIntro, INTRO_SCRIPT, introGate } from "./intro";

function memoryStorage(entries: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(entries));
  // Object.keys(localStorage) lists stored keys in a browser; spreading them on matches that.
  return Object.assign(Object.create(null), Object.fromEntries(map), {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  }) as Storage;
}

interface Env {
  session?: Storage;
  local?: Storage;
  reduced?: boolean;
}

function browser({ session = memoryStorage(), local = memoryStorage(), reduced = false }: Env = {}) {
  const attrs = new Map<string, string>();
  const doc = { documentElement: { setAttribute: (k: string, v: string) => void attrs.set(k, v) } } as unknown as Document;
  const win = { sessionStorage: session, localStorage: local, matchMedia: () => ({ matches: reduced }) } as unknown as Window;
  return { doc, win, intro: () => attrs.get("data-intro") };
}

const blocked = new Proxy({} as Storage, {
  get() {
    throw new DOMException("denied", "SecurityError");
  },
  ownKeys() {
    throw new DOMException("denied", "SecurityError");
  },
});

describe("introGate", () => {
  it("plays on a first visit", () => {
    const b = browser();
    expect(introGate(b.doc, b.win)).toBe(true);
    expect(b.intro()).toBe("play");
  });

  it("skips once this tab has seen it", () => {
    const b = browser();
    endIntro(b.doc, b.win);
    expect(introGate(b.doc, b.win)).toBe(false);
    expect(b.intro()).toBe("skip");
  });

  it("skips under reduced motion", () => {
    const b = browser({ reduced: true });
    expect(introGate(b.doc, b.win)).toBe(false);
    expect(b.intro()).toBe("skip");
  });

  it("skips for someone who has signed in on this browser", () => {
    const b = browser({ local: memoryStorage({ "CognitoIdentityServiceProvider.abc123.LastAuthUser": "u1" }) });
    expect(introGate(b.doc, b.win)).toBe(false);
  });

  it("still plays with unrelated keys in local storage", () => {
    const b = browser({ local: memoryStorage({ "pickem.next": "/groups/" }) });
    expect(introGate(b.doc, b.win)).toBe(true);
  });

  it("skips rather than throws when storage is blocked", () => {
    const b = browser({ session: blocked, local: blocked });
    expect(introGate(b.doc, b.win)).toBe(false);
    expect(b.intro()).toBe("skip");
  });
});

describe("INTRO_SCRIPT", () => {
  it("runs standalone, the way the inline script does", () => {
    const first = browser();
    new Function("document", "window", INTRO_SCRIPT)(first.doc, first.win);
    expect(first.intro()).toBe("play");

    const reduced = browser({ reduced: true });
    new Function("document", "window", INTRO_SCRIPT)(reduced.doc, reduced.win);
    expect(reduced.intro()).toBe("skip");
  });
});

describe("endIntro", () => {
  it("marks the page done, skipped or finished", () => {
    const b = browser();
    endIntro(b.doc, b.win);
    expect(b.intro()).toBe("done");
  });

  it("still ends the intro when storage is blocked", () => {
    const b = browser({ session: blocked });
    expect(() => endIntro(b.doc, b.win)).not.toThrow();
    expect(b.intro()).toBe("done");
  });
});
