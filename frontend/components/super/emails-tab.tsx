"use client";

import { useCallback, useState } from "react";

import { LoadError } from "@/components/load-error";
import { SectionTitle, Skeleton } from "@/components/super/ui";
import { Select } from "@/components/ui/input";
import { useLoad } from "@/lib/api/use-load";
import { getEmails, getSuperGroups, getSuperUsers } from "@/lib/super";
import { cn } from "@/lib/utils";

export function EmailsTab() {
  const [groupId, setGroupId] = useState("");
  const fetcher = useCallback(
    () => Promise.all([getEmails(groupId || undefined), getSuperGroups(), getSuperUsers()]),
    [groupId],
  );
  const { load, retry } = useLoad(fetcher);

  if (load.status === "loading") return <Skeleton label="Loading email activity" />;
  if (load.status === "error") return <LoadError title="Couldn't load email activity" message={load.message} onRetry={retry} />;

  const [{ claims, events }, groups, users] = load.data;
  const groupName = new Map(groups.map((g) => [g.groupId, g.name]));
  const userName = new Map(users.map((u) => [u.sub, u.name ?? u.email ?? u.sub]));

  return (
    <>
      <label className="panel grid gap-1.5 p-4 text-sm font-medium">
        Group
        <Select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          <option value="">All groups</option>
          {groups.map((g) => (
            <option key={g.groupId} value={g.groupId}>
              {g.name}
            </option>
          ))}
        </Select>
      </label>

      <SectionTitle>Sends</SectionTitle>
      <p className="mt-1 text-sm text-muted-foreground">Newest 200 from the claim log: one row per email attempted.</p>
      {claims.length === 0 ? (
        <p className="panel mt-3 p-4 text-muted-foreground">No emails yet.</p>
      ) : (
        <ul className="panel mt-3 divide-y">
          {claims.map((c) => (
            <li key={`${c.sub}${c.groupId}${c.eventId}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{userName.get(c.sub) ?? c.sub}</span>
                <span className="block truncate text-muted-foreground">
                  {c.eventId} · {groupName.get(c.groupId) ?? c.groupId}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className={cn("block font-semibold uppercase", c.status === "sent" ? "text-correct" : "text-wrong")}>{c.status}</span>
                <span className="text-xs text-muted-foreground">{new Date(c.at).toLocaleString()}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <SectionTitle>Events</SectionTitle>
      <p className="mt-1 text-sm text-muted-foreground">What grading emitted for the mail sweep to send from.</p>
      {events.length === 0 ? (
        <p className="panel mt-3 p-4 text-muted-foreground">No events yet.</p>
      ) : (
        <ul className="panel mt-3 divide-y">
          {events.map((e) => (
            <li key={`${e.at}${e.groupId}${e.eventId}`} className="px-4 py-2.5 text-sm">
              <span className="font-semibold">{e.type.replaceAll("_", " ")}</span>
              <span className="text-muted-foreground">
                {" "}
                · Week {e.week} · {groupName.get(e.groupId) ?? e.groupId} · {new Date(e.at).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
