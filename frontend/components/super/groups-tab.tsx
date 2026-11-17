"use client";

import { ArrowLeft, ChevronRight, Search } from "lucide-react";
import { useCallback, useState } from "react";

import { LoadError } from "@/components/load-error";
import { SectionTitle, Skeleton, Stat } from "@/components/super/ui";
import { Input } from "@/components/ui/input";
import { useLoad } from "@/lib/api/use-load";
import { ENTRY_LABEL, ROLE_LABEL } from "@/lib/groups";
import { dollars } from "@/lib/payments";
import { type SuperGroup, getSuperGroup, getSuperGroups, matches } from "@/lib/super";

export function GroupsTab() {
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const fetcher = useCallback(() => getSuperGroups(), []);
  const { load, retry } = useLoad(fetcher);

  if (open) return <GroupDetail id={open} onBack={() => setOpen(null)} />;
  if (load.status === "loading") return <Skeleton label="Loading groups" />;
  if (load.status === "error") return <LoadError title="Couldn't load groups" message={load.message} onRetry={retry} />;

  const shown = load.data.filter((g) => matches(query, g.name, g.owner, g.groupId));
  return (
    <>
      <label className="relative block">
        <span className="sr-only">Search groups</span>
        <Search className="pointer-events-none absolute top-3 left-3 size-5 text-muted-foreground" aria-hidden="true" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, owner or id" className="pl-10" />
      </label>
      {shown.length === 0 ? (
        <p className="panel mt-3 p-4 text-muted-foreground">{load.data.length ? "No group matches that." : "No groups yet."}</p>
      ) : (
        <ul className="panel mt-3 divide-y">
          {shown.map((g) => (
            <li key={g.groupId}>
              <button
                type="button"
                onClick={() => setOpen(g.groupId)}
                className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/60"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-xl font-extrabold uppercase">{g.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {g.season}
                    {g.replay ? " replay" : ""} · {g.members} members · {g.owner ?? "no owner"}
                  </span>
                </span>
                <ChevronRight className="size-5 text-muted-foreground" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function GroupDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const fetcher = useCallback(() => getSuperGroup(id), [id]);
  const { load, retry } = useLoad(fetcher);
  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="chalk inline-flex min-h-11 items-center gap-1.5 text-sm tracking-[0.14em] outline-none hover:text-primary focus-visible:text-primary"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        All groups
      </button>
      {load.status === "loading" && <Skeleton label="Loading the group" />}
      {load.status === "error" && <LoadError title="Couldn't load this group" message={load.message} onRetry={retry} />}
      {load.status === "ready" && <GroupBody data={load.data} />}
    </>
  );
}

function GroupBody({ data }: { data: SuperGroup }) {
  const { group, payments, death } = data;
  const overrides = Object.entries(data.flags);
  return (
    <>
      <h2 className="paint worn mt-2 text-4xl leading-none break-words">{group.name}</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {group.season} season{group.replay ? " · replay" : ""} · rules v{data.rulesVersion} · id {group.groupId}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Members" value={data.members.length} />
        <Stat label="Owed" value={dollars(payments.owed)} />
        <Stat label="Paid" value={dollars(payments.paid)} />
        <Stat label="Death alive" value={`${death.alive}/${death.entries.length}`} />
      </div>

      <SectionTitle>Members</SectionTitle>
      <ul className="panel mt-3 divide-y">
        {data.members.map((m) => {
          const money = payments.members.find((r) => r.sub === m.sub);
          return (
            <li key={m.sub} className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{m.name}</span>
                <span className="text-sm text-muted-foreground">
                  {ROLE_LABEL[m.role]} · {ENTRY_LABEL[m.entryType]}
                  {m.joinedWeek && m.joinedWeek > 1 ? ` · from Week ${m.joinedWeek}` : ""}
                </span>
              </span>
              {money && (
                <span className={money.balance > 0 ? "text-sm text-wrong" : "text-sm text-correct"}>
                  {money.balance > 0 ? `owes ${dollars(money.balance)}` : "paid up"}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <SectionTitle>Death pool</SectionTitle>
      {death.entries.length === 0 ? (
        <p className="panel mt-3 p-4 text-muted-foreground">No entries.</p>
      ) : (
        <ul className="panel mt-3 divide-y">
          {death.entries.map((e) => (
            <li key={e.label} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2 text-sm">
              <span className="truncate">
                <span className="font-semibold">{e.label}</span> <span className="text-muted-foreground">{e.owner}</span>
              </span>
              <span className={e.eliminatedWeek ? "text-wrong" : "text-correct"}>
                {e.eliminatedWeek ? `out Week ${e.eliminatedWeek}` : `${e.livesLeft} ${e.livesLeft === 1 ? "life" : "lives"}`}
              </span>
            </li>
          ))}
        </ul>
      )}

      <SectionTitle>Flag overrides</SectionTitle>
      <p className="panel mt-3 p-4 text-sm text-muted-foreground">
        {overrides.length
          ? overrides.map(([name, value]) => `${name}: ${String(value)}`).join(" · ")
          : "None. This group inherits every global flag."}
      </p>
    </>
  );
}
