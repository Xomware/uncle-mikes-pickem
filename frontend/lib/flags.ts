"use client";

import { useEffect, useState } from "react";

import { ApiError, request } from "@/lib/api/client";

// Mirrors backend common/flags.py DEFAULTS. The API enforces every flag; hiding is only so nobody clicks into a 404.
export const FLAG_DEFAULTS = {
  deathPool: true,
  payments: true,
  gameInfo: true,
  filmRoom: true,
  analytics: true,
  payouts: true,
  printableSheets: true,
  replayGroups: true,
  groupCreation: true,
  emailResults: true,
  emailReminders: true,
  emailDeath: true,
  emailGowAdmin: true,
  emailAnnouncements: true,
  maintenanceBanner: "",
};

export type Flags = typeof FLAG_DEFAULTS;
export type FlagName = keyof Flags;

const loaded = new Map<string, Promise<Flags>>();

/** Resolved flags, fetched once per group per page load. */
export function loadFlags(groupId?: string): Promise<Flags> {
  const key = groupId ?? "";
  let flags = loaded.get(key);
  if (!flags) {
    const query = groupId ? `?groupId=${encodeURIComponent(groupId)}` : "";
    flags = request<Flags>(`/config/flags${query}`).catch(() => {
      // Fail open: the API still refuses whatever is off. Dropped so the next page retries.
      loaded.delete(key);
      return FLAG_DEFAULTS;
    });
    loaded.set(key, flags);
  }
  return flags;
}

export function useFlags(groupId?: string): Flags {
  const [flags, setFlags] = useState(FLAG_DEFAULTS);
  useEffect(() => {
    let live = true;
    loadFlags(groupId).then((f) => live && setFlags(f));
    return () => {
      live = false;
    };
  }, [groupId]);
  return flags;
}

let superAdmin: Promise<boolean> | null = null;

/** Whether the caller is the super admin: /super/overview answers 200 for them and 404 for everyone else. */
export function isSuperAdmin(): Promise<boolean> {
  superAdmin ??= request("/super/overview").then(
    () => true,
    (err: unknown) => {
      // Only a 404 is an answer. A network error or 5xx asks again next time.
      if (!(err instanceof ApiError && err.status === 404)) superAdmin = null;
      return false;
    },
  );
  return superAdmin;
}

export function useSuperAdmin(): boolean {
  const [yes, setYes] = useState(false);
  useEffect(() => {
    let live = true;
    isSuperAdmin().then((v) => live && setYes(v));
    return () => {
      live = false;
    };
  }, []);
  return yes;
}

/** Test seam: forget what this page load fetched. */
export function resetFlagCache() {
  loaded.clear();
  superAdmin = null;
}
