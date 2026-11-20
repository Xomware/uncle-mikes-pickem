"use client";

import { useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { getNflTeams, myGroups } from "@/lib/api/client";
import { useLoad } from "@/lib/api/use-load";

/**
 * Team records as one group sees them: ?groupId=, else the caller's newest group, else the live season.
 * A replay group's records stop at its clock, so the group decides what's shown.
 */
export function useTeams(team?: string) {
  const groupId = useSearchParams().get("groupId");
  const fetcher = useCallback(async () => {
    if (groupId) {
      const [groups, data] = await Promise.all([myGroups(), getNflTeams(groupId, team)]);
      return { groups, data };
    }
    const groups = await myGroups();
    return { groups, data: await getNflTeams(groups[0]?.groupId ?? null, team) };
  }, [groupId, team]);
  return useLoad(fetcher);
}
