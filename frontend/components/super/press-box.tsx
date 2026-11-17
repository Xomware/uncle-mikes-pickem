"use client";

import { type ReactNode, useEffect, useState } from "react";

import { FieldTitle } from "@/components/field/field-title";
import { EmailsTab } from "@/components/super/emails-tab";
import { FlagsTab } from "@/components/super/flags-tab";
import { GroupsTab } from "@/components/super/groups-tab";
import { JobsTab } from "@/components/super/jobs-tab";
import { OverviewTab } from "@/components/super/overview-tab";
import { UsersTab } from "@/components/super/users-tab";
import { isSuperAdmin } from "@/lib/flags";
import { cn } from "@/lib/utils";

const TABS = {
  overview: { label: "Overview", body: () => <OverviewTab /> },
  groups: { label: "Groups", body: () => <GroupsTab /> },
  users: { label: "Users", body: () => <UsersTab /> },
  flags: { label: "Feature flags", body: () => <FlagsTab /> },
  emails: { label: "Emails", body: () => <EmailsTab /> },
  jobs: { label: "Jobs", body: () => <JobsTab /> },
} satisfies Record<string, { label: string; body: () => ReactNode }>;

type Tab = keyof typeof TABS;

export function PressBox() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    isSuperAdmin().then(setAllowed);
  }, []);

  if (allowed === null) {
    return (
      <div className="press-box mx-auto w-full max-w-5xl animate-pulse px-4 py-8 sm:px-6" aria-busy="true">
        <span className="block h-12 w-56 rounded bg-card/70" />
        <span className="sr-only">Loading</span>
      </div>
    );
  }
  // The same answer the API gives: nothing here.
  if (!allowed) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
        <FieldTitle>Not found</FieldTitle>
        <p className="mt-4 text-muted-foreground">There&apos;s no page here.</p>
      </div>
    );
  }

  return (
    <div className="press-box mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <FieldTitle sub="Super admin · every group, every job">Press Box</FieldTitle>
      <div role="tablist" aria-label="Press box sections" className="panel mt-6 flex gap-1 overflow-x-auto p-1">
        {(Object.keys(TABS) as Tab[]).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`tab-${key}`}
            aria-selected={tab === key}
            aria-controls="press-box-panel"
            onClick={() => setTab(key)}
            className={cn(
              "h-11 shrink-0 rounded-md px-4 font-display text-lg font-extrabold tracking-wide uppercase outline-none focus-visible:ring-3 focus-visible:ring-ring/60",
              tab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {TABS[key].label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="press-box-panel" aria-labelledby={`tab-${tab}`} className="mt-6">
        {TABS[tab].body()}
      </div>
    </div>
  );
}
