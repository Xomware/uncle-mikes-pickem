"use client";

import {
  Binoculars,
  CircleAlert,
  CircleCheck,
  CircleX,
  Link2,
  ListOrdered,
  Plus,
  Printer,
  ReceiptText,
  Settings,
  Star,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useState } from "react";

import { FieldTitle } from "@/components/field/field-title";
import { InviteLink } from "@/components/groups/invite-link";
import { Loaded } from "@/components/loaded";
import { Button, buttonVariants } from "@/components/ui/button";
import { type CheckState, gowState, paidState, picksState } from "@/lib/admin";
import { type AdminGroup, getAdminOverview } from "@/lib/api/client";
import { useLoad } from "@/lib/api/use-load";
import { useFlags, useSuperAdmin } from "@/lib/flags";
import { ROLE_LABEL, groupHref } from "@/lib/groups";
import { picksHref } from "@/lib/picks";
import { standingsHref } from "@/lib/results";
import { sheetHref } from "@/lib/sheet";
import { etDate } from "@/lib/time";
import { cn } from "@/lib/utils";

const MARK = {
  done: { icon: CircleCheck, tone: "text-correct", label: "Done" },
  todo: { icon: CircleAlert, tone: "text-led", label: "To do" },
  late: { icon: CircleX, tone: "text-wrong", label: "Overdue" },
} satisfies Record<CheckState, { icon: typeof CircleCheck; tone: string; label: string }>;

export function AdminPortal() {
  const { load, retry } = useLoad(getAdminOverview);
  const boss = useSuperAdmin();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <FieldTitle sub="Your groups · this week's to-do list">Admin</FieldTitle>
      <div className="mt-6">
        <Loaded load={load} retry={retry} what="your groups" height="h-64">
          {(groups) => (
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {groups.map((g) => (
                <GroupCard key={g.groupId} group={g} />
              ))}
              {groups.length === 0 && <NoGroups />}
              {boss && <PressBoxCard />}
            </div>
          )}
        </Loaded>
      </div>
    </div>
  );
}

function GroupCard({ group }: { group: AdminGroup }) {
  const [now] = useState(() => new Date());
  const [inviting, setInviting] = useState(false);
  const flags = useFlags(group.groupId);
  const id = encodeURIComponent(group.groupId);
  const picked = group.members - group.missing.length;

  return (
    <section className="panel flex flex-col p-5" aria-labelledby={`admin-${group.groupId}`}>
      <h2 id={`admin-${group.groupId}`} className="truncate font-display text-2xl font-extrabold uppercase">
        <Link href={groupHref(group.groupId)} className="hover:underline">
          {group.name}
        </Link>
      </h2>
      <p className="text-sm text-muted-foreground">
        Week {group.week} · {ROLE_LABEL[group.role]}
        {group.replay && " · Replay"}
        {group.lockAt && ` · Locks ${etDate(group.lockAt)}`}
      </p>

      <ul className="mt-4 space-y-3">
        {group.lockAt ? (
          <>
            <Check state={gowState(group, now)} title={group.gow ? `GOW: ${group.gow.matchup ?? "set"}` : "Game of the Week"}>
              {group.gow ? (
                group.gow.chosenBy === "auto" ? "Set automatically" : `Chosen by ${group.gow.chosenBy}`
              ) : (
                <>
                  {group.gowDeadline &&
                    (gowState(group, now) === "late"
                      ? `Deadline passed ${etDate(group.gowDeadline)}; the top-hype game gets set on the next run.`
                      : `Auto-picks ${etDate(group.gowDeadline)} if you don't.`)}
                  <Link
                    href={picksHref(group.groupId, group.week)}
                    className={cn(buttonVariants({ size: "sm" }), "mt-2 flex w-fit")}
                  >
                    <Star aria-hidden="true" />
                    Choose GOW
                  </Link>
                </>
              )}
            </Check>
            <Check state={picksState(group, now)} title={`${picked} of ${group.members} picked`}>
              {group.missing.length > 0 && `Waiting on ${group.missing.join(", ")}`}
            </Check>
          </>
        ) : (
          <li className="text-muted-foreground">No games scheduled for Week {group.week}.</li>
        )}
        {group.unpaid && (
          <Check
            state={paidState(group.unpaid)}
            title={group.unpaid.count ? `${group.unpaid.count} unpaid · $${group.unpaid.amount}` : "Everyone's paid up"}
          >
            {group.unpaid.count > 0 && (
              <>
                {group.unpaid.names.join(", ")}{" "}
                <Link href={`/group/payments/?id=${id}`} className="font-semibold text-primary hover:underline">
                  Mark payments
                </Link>
              </>
            )}
          </Check>
        )}
      </ul>

      <div className="mt-auto flex flex-wrap gap-2 pt-5">
        <QuickLink href={`/group/settings/?id=${id}`} icon={<Settings aria-hidden="true" />}>
          Settings
        </QuickLink>
        {group.unpaid && (
          <QuickLink href={`/group/payments/?id=${id}`} icon={<ReceiptText aria-hidden="true" />}>
            Payments
          </QuickLink>
        )}
        <QuickLink href={standingsHref(group.groupId)} icon={<ListOrdered aria-hidden="true" />}>
          Standings
        </QuickLink>
        {flags.printableSheets && group.lockAt && (
          <QuickLink href={sheetHref(group.groupId, group.week)} icon={<Printer aria-hidden="true" />}>
            Sheets
          </QuickLink>
        )}
        <Button variant="outline" size="sm" className="h-9" aria-expanded={inviting} onClick={() => setInviting(!inviting)}>
          <Link2 aria-hidden="true" />
          Invite link
        </Button>
      </div>
      {inviting && <InviteLink groupId={group.groupId} />}
    </section>
  );
}

function Check({ state, title, children }: { state: CheckState; title: string; children?: ReactNode }) {
  const { icon: Icon, tone, label } = MARK[state];
  return (
    <li className="flex gap-3">
      <Icon className={cn("mt-0.5 size-5 shrink-0", tone)} aria-hidden="true" />
      <div className="min-w-0">
        <p className={cn("font-semibold", state !== "done" && tone)}>
          <span className="sr-only">{label}: </span>
          {title}
        </p>
        {children && <div className="text-sm text-muted-foreground">{children}</div>}
      </div>
    </li>
  );
}

function QuickLink({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Link href={href} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-9")}>
      {icon}
      {children}
    </Link>
  );
}

function PressBoxCard() {
  return (
    <section className="scoreboard flex flex-col p-5">
      <h2 className="led text-2xl uppercase">Press Box</h2>
      <p className="mt-1 text-sm text-chalk/80">Super admin: every group, users, flags, emails and jobs.</p>
      <Link href="/super/" className={cn(buttonVariants(), "mt-auto w-fit")}>
        <Binoculars aria-hidden="true" />
        Open the Press Box
      </Link>
    </section>
  );
}

function NoGroups() {
  return (
    <div className="rounded-xl border border-dashed bg-card/85 p-6 text-center lg:col-span-2">
      <h2 className="font-display text-2xl font-extrabold uppercase">You don&apos;t run a group yet</h2>
      <p className="mx-auto mt-2 max-w-sm leading-relaxed text-muted-foreground">
        Owners and admins get a to-do list here each week: the Game of the Week, who still needs picks, and who owes.
      </p>
      <Link href="/groups/" className={cn(buttonVariants(), "mt-4")}>
        <Plus aria-hidden="true" />
        Start a group
      </Link>
    </div>
  );
}
