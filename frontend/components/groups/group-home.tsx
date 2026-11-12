"use client";

import { Settings } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

import { DeathPool } from "@/components/death/death-pool";
import { InviteLink } from "@/components/groups/invite-link";
import { LoadError } from "@/components/load-error";
import { buttonVariants } from "@/components/ui/button";
import { type GroupDetail, getGroup } from "@/lib/api/client";
import { useLoad } from "@/lib/api/use-load";
import { ENTRY_LABEL, ROLE_LABEL, isOrganizer } from "@/lib/groups";
import { cn } from "@/lib/utils";

const TABS = { members: "Members", death: "Death pool" } as const;

export function GroupHome() {
  const id = useSearchParams().get("id") ?? "";
  const fetcher = useCallback(() => getGroup(id), [id]);
  const { load, retry } = useLoad(fetcher);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6" aria-busy={load.status === "loading"}>
      {load.status === "loading" && (
        <div className="animate-pulse space-y-3">
          <span className="block h-9 w-56 rounded bg-muted" />
          <span className="block h-24 rounded-xl bg-muted" />
          <span className="sr-only">Loading the group</span>
        </div>
      )}
      {load.status === "error" && <LoadError title="Couldn't load this group" message={load.message} onRetry={retry} />}
      {load.status === "ready" && <GroupDetails detail={load.data} />}
    </div>
  );
}

function GroupDetails({ detail }: { detail: GroupDetail }) {
  const { group, role, members } = detail;
  const [tab, setTab] = useState<keyof typeof TABS>("members");
  return (
    <>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-bold break-words uppercase sm:text-4xl">{group.name}</h1>
          <p className="mt-1 text-muted-foreground">
            {group.season} season · You&apos;re {ROLE_LABEL[role].toLowerCase()}
          </p>
        </div>
        {isOrganizer(role) && (
          <Link
            href={`/group/settings/?id=${encodeURIComponent(group.groupId)}`}
            className={buttonVariants({ variant: "outline" })}
          >
            <Settings aria-hidden="true" />
            Settings
          </Link>
        )}
      </div>

      <div role="tablist" aria-label="Group sections" className="mt-6 flex gap-1 border-b">
        {(Object.keys(TABS) as (keyof typeof TABS)[]).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "-mb-px h-11 border-b-2 px-4 font-semibold uppercase outline-none focus-visible:ring-3 focus-visible:ring-ring/60",
              tab === key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {TABS[key]}
          </button>
        ))}
      </div>

      {tab === "death" && (
        <DeathPool
          groupId={group.groupId}
          organizer={isOrganizer(role)}
          members={members}
          fee={detail.rules.fees.death}
        />
      )}

      {tab === "members" && isOrganizer(role) && <InviteLink groupId={group.groupId} />}

      <section className="mt-8" hidden={tab !== "members"}>
        <h2 className="text-xl font-semibold uppercase">
          Members <span className="text-muted-foreground">({members.length})</span>
        </h2>
        <ul className="mt-3 divide-y rounded-xl border bg-card">
          {members.map((m) => (
            <li key={m.sub} className="flex min-h-14 items-center gap-3 px-4 py-2">
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary font-display font-bold"
              >
                {m.name.trim().charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{m.name}</span>
                <span className="text-sm text-muted-foreground">
                  {ENTRY_LABEL[m.entryType]}
                  {m.joinedWeek && m.joinedWeek > 1 ? ` · from Week ${m.joinedWeek}` : ""}
                </span>
              </span>
              {m.role !== "member" && (
                <span className="rounded-md border border-primary/40 px-2 py-0.5 text-xs font-semibold text-primary uppercase">
                  {ROLE_LABEL[m.role]}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
