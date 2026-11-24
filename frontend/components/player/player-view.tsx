"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { FieldTitle } from "@/components/field/field-title";
import { Loaded } from "@/components/loaded";
import { StatsBody } from "@/components/profile/my-stats";
import { getPlayerStats } from "@/lib/api/client";
import { useLoad } from "@/lib/api/use-load";
import { groupHref } from "@/lib/groups";

/** Another player's season: reached from a group's standings (?g=) or the global leaderboard. */
export function PlayerView() {
  const params = useSearchParams();
  const sub = params.get("sub") ?? "";
  const groupId = params.get("g");
  const fetcher = useCallback(() => getPlayerStats(sub, groupId), [sub, groupId]);
  const { load, retry } = useLoad(fetcher);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:max-w-6xl" aria-busy={load.status === "loading"}>
      <Link
        href={groupId ? groupHref(groupId) : "/leaderboard/"}
        className="chalk inline-flex min-h-11 items-center gap-1.5 text-sm tracking-[0.14em] hover:text-primary"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {groupId ? "Back to group" : "Leaders"}
      </Link>
      <Loaded load={load} retry={retry} what="this player" height="h-96">
        {(stats) => (
          <div className="space-y-6">
            <FieldTitle
              sub={`${stats.group ? `${stats.group.name} · ${stats.group.season}` : "Global leaderboard"} · Thru Wk ${stats.throughWeek}`}
            >
              {stats.player.name}
            </FieldTitle>
            <StatsBody stats={stats} />
          </div>
        )}
      </Loaded>
    </div>
  );
}
