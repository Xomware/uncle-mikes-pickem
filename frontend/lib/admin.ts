"use client";

import { useEffect, useState } from "react";

import { type AdminGroup, myGroups } from "@/lib/api/client";
import { isSuperAdmin } from "@/lib/flags";
import { isOrganizer } from "@/lib/groups";

/** done is checked off; todo is amber; late is red: the deadline has passed or the lock is under a day away. */
export type CheckState = "done" | "todo" | "late";

const DAY = 24 * 60 * 60 * 1000;

export function gowState(group: AdminGroup, now: Date): CheckState {
  if (group.gow) return "done";
  return group.gowDeadline && new Date(group.gowDeadline) <= now ? "late" : "todo";
}

export function picksState(group: AdminGroup, now: Date): CheckState {
  if (group.missing.length === 0) return "done";
  return group.lockAt && new Date(group.lockAt).getTime() - now.getTime() < DAY ? "late" : "todo";
}

export const paidState = (unpaid: NonNullable<AdminGroup["unpaid"]>): CheckState => (unpaid.count ? "todo" : "done");

let admin: Promise<boolean> | null = null;

/** Whether to show the Admin tab: the caller organizes a group, or is the super admin. */
export function hasAdmin(): Promise<boolean> {
  admin ??= Promise.all([
    // A failed lookup hides the tab for this page load and asks again on the next.
    myGroups().then(
      (groups) => groups.some((g) => isOrganizer(g.role)),
      () => {
        admin = null;
        return false;
      },
    ),
    isSuperAdmin(),
  ]).then(([organizer, boss]) => organizer || boss);
  return admin;
}

export function useHasAdmin(): boolean {
  const [yes, setYes] = useState(false);
  useEffect(() => {
    let live = true;
    hasAdmin().then((v) => live && setYes(v));
    return () => {
      live = false;
    };
  }, []);
  return yes;
}
