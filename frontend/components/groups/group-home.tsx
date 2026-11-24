"use client";

import {
  Printer,
  ReceiptText,
  Settings,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

import { DeathPool } from "@/components/death/death-pool";
import { FieldTitle } from "@/components/field/field-title";
import { GroupDashboard } from "@/components/groups/group-dashboard";
import { InviteLink } from "@/components/groups/invite-link";
import { ReplayBar } from "@/components/groups/replay-bar";
import { LoadError } from "@/components/load-error";
import { StandingsLink } from "@/components/results/season-standings";
import { buttonVariants } from "@/components/ui/button";
import { type GroupDetail, getGroup } from "@/lib/api/client";
import { useLoad } from "@/lib/api/use-load";
import { useFlags } from "@/lib/flags";
import { ENTRY_LABEL, ROLE_LABEL, isOrganizer } from "@/lib/groups";
import { cn } from "@/lib/utils";

const TABS = { members: "Members", death: "Death pool" } as const;

export function GroupHome() {
  const id = useSearchParams().get("id") ?? "";
  const fetcher = useCallback(() => getGroup(id), [id]);
  const { load, retry, setData } = useLoad(fetcher);

  return (
    <div
      className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6"
      aria-busy={load.status === "loading"}
    >
      {load.status === "loading" && (
        <div className="animate-pulse space-y-3">
          <span className="block h-12 w-56 rounded bg-card/70" />
          <span className="block h-24 rounded-xl bg-card/70" />
          <span className="sr-only">Loading the group</span>
        </div>
      )}
      {load.status === "error" && (
        <LoadError
          title="Couldn't load this group"
          message={load.message}
          onRetry={retry}
        />
      )}
      {load.status === "ready" && (
        <GroupDetails detail={load.data} onChange={setData} />
      )}
    </div>
  );
}

function GroupDetails({
  detail,
  onChange,
}: {
  detail: GroupDetail;
  onChange: (detail: GroupDetail) => void;
}) {
  const { group, role, members, replay } = detail;
  const [chosen, setTab] = useState<keyof typeof TABS>("members");
  const flags = useFlags(group.groupId);
  const tab = flags.deathPool ? chosen : "members";
  return (
    <>
      <FieldTitle
        sub={`${group.season} season · You're ${ROLE_LABEL[role].toLowerCase()}`}
      >
        {group.name}
      </FieldTitle>
      <div className="mt-4 flex flex-wrap gap-2">
        <StandingsLink groupId={group.groupId} />
        {flags.payments && (
          <Link
            href={`/group/pay/?id=${encodeURIComponent(group.groupId)}`}
            className={buttonVariants({ variant: "outline" })}
          >
            <Wallet aria-hidden="true" />
            Pay
          </Link>
        )}
        {flags.printableSheets && (
          <Link
            href={`/group/standings-sheet/?id=${encodeURIComponent(group.groupId)}`}
            className={buttonVariants({ variant: "outline" })}
          >
            <Printer aria-hidden="true" />
            Standings sheet
          </Link>
        )}
        {flags.payments && (isOrganizer(role) || flags.payouts) && (
          <Link
            href={`/group/payments/?id=${encodeURIComponent(group.groupId)}`}
            className={buttonVariants({ variant: "outline" })}
          >
            <ReceiptText aria-hidden="true" />
            {isOrganizer(role) ? "Payments" : "Payouts"}
          </Link>
        )}
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

      {replay && (
        <ReplayBar
          groupId={group.groupId}
          organizer={isOrganizer(role)}
          replay={replay}
          onMoved={(clock) =>
            onChange({ ...detail, replay: { ...replay, clock } })
          }
        />
      )}

      <GroupDashboard
        // A moved replay clock changes the open week and what's locked: refetch.
        key={replay?.clock}
        groupId={group.groupId}
        payouts={flags.payouts}
        deathPool={flags.deathPool}
      >
        <div
          role="tablist"
          aria-label="Group sections"
          className="panel grid grid-cols-2 gap-1 p-1"
          hidden={!flags.deathPool}
        >
          {(Object.keys(TABS) as (keyof typeof TABS)[]).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                "h-11 rounded-md px-4 font-display text-lg font-extrabold tracking-wide uppercase outline-none focus-visible:ring-3 focus-visible:ring-ring/60",
                tab === key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
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

        {tab === "members" && isOrganizer(role) && (
          <InviteLink groupId={group.groupId} />
        )}

        <section className="mt-6" hidden={tab !== "members"}>
          <h2 className="paint worn text-4xl leading-none">
            Roster <span className="text-chalk/70">({members.length})</span>
          </h2>
          <ul className="panel mt-3 divide-y lg:grid lg:grid-cols-2 lg:divide-y-0">
            {members.map((m) => (
              <li
                key={m.sub}
                className="flex min-h-14 items-center gap-3 px-4 py-2 lg:border-t lg:odd:border-r lg:last:odd:col-span-2 lg:last:odd:border-r-0 lg:[&:nth-child(-n+2)]:border-t-0"
              >
                <span
                  aria-hidden="true"
                  className="flex size-10 shrink-0 items-center justify-center rounded-md bg-turf font-stencil text-xl font-black text-chalk shadow-[inset_0_-2px_0_var(--chalk)]"
                >
                  {m.name.trim().charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-lg font-bold">
                    {m.name}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {ENTRY_LABEL[m.entryType]}
                    {m.joinedWeek && m.joinedWeek > 1
                      ? ` · from Week ${m.joinedWeek}`
                      : ""}
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
      </GroupDashboard>
    </>
  );
}
