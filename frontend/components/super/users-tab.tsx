"use client";

import { Search } from "lucide-react";
import { useCallback, useState } from "react";

import { LoadError } from "@/components/load-error";
import { Skeleton } from "@/components/super/ui";
import { Input } from "@/components/ui/input";
import { useLoad } from "@/lib/api/use-load";
import { ROLE_LABEL } from "@/lib/groups";
import { ago, getSuperUsers, matches } from "@/lib/super";

export function UsersTab() {
  const [query, setQuery] = useState("");
  const [now] = useState(() => new Date());
  const fetcher = useCallback(() => getSuperUsers(), []);
  const { load, retry } = useLoad(fetcher);

  if (load.status === "loading") return <Skeleton label="Loading users" />;
  if (load.status === "error") return <LoadError title="Couldn't load users" message={load.message} onRetry={retry} />;

  const shown = load.data.filter((u) => matches(query, u.name, u.email, ...u.groups.map((g) => g.name)));
  return (
    <>
      <label className="relative block">
        <span className="sr-only">Search users</span>
        <Search className="pointer-events-none absolute top-3 left-3 size-5 text-muted-foreground" aria-hidden="true" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, email or group" className="pl-10" />
      </label>
      <p className="mt-3 text-sm text-muted-foreground">
        {shown.length} of {load.data.length} signed in at least once
      </p>
      {shown.length > 0 && (
        <ul className="panel mt-2 divide-y">
          {shown.map((u) => (
            <li key={u.sub} className="px-4 py-3">
              <p className="flex items-baseline justify-between gap-3">
                <span className="truncate font-semibold">{u.name ?? u.email}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{u.lastSeen ? `seen ${ago(u.lastSeen, now)}` : "never seen"}</span>
              </p>
              <p className="truncate text-sm text-muted-foreground">{u.email}</p>
              {u.groups.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Groups">
                  {u.groups.map((g) => (
                    <li key={g.groupId} className="rounded-md border px-2 py-0.5 text-xs">
                      {g.name}
                      {g.role !== "member" && <span className="text-primary"> · {ROLE_LABEL[g.role]}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
