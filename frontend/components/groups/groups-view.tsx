"use client";

import { ChevronRight, LoaderCircle, Plus, UsersRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { LoadError } from "@/components/load-error";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { createGroup, myGroups } from "@/lib/api/client";
import { useLoad } from "@/lib/api/use-load";
import { ROLE_LABEL, groupHref, seasonOptions } from "@/lib/groups";

export function GroupsView() {
  const { load, retry } = useLoad(myGroups);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="text-4xl font-bold uppercase">My groups</h1>
      <section aria-live="polite" aria-busy={load.status === "loading"} className="mt-6">
        {load.status === "loading" && <ListSkeleton />}
        {load.status === "error" && <LoadError title="Couldn't load your groups" message={load.message} onRetry={retry} />}
        {load.status === "ready" && load.data.length === 0 && (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <UsersRound className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
            <h2 className="mt-3 text-xl font-semibold uppercase">No groups yet</h2>
            <p className="mx-auto mt-2 max-w-sm leading-relaxed text-muted-foreground">
              Open an invite link from your organizer while signed in, or start your own group below.
            </p>
          </div>
        )}
        {load.status === "ready" && load.data.length > 0 && (
          <ul className="divide-y rounded-xl border bg-card">
            {load.data.map((g) => (
              <li key={g.groupId}>
                <Link
                  href={groupHref(g.groupId)}
                  className="flex min-h-16 items-center gap-3 px-4 py-3 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/60"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-lg font-semibold">{g.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {g.season} season · {ROLE_LABEL[g.role]}
                    </span>
                  </span>
                  <ChevronRight className="size-5 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <CreateGroupForm />
    </div>
  );
}

function CreateGroupForm() {
  const router = useRouter();
  const [seasons] = useState(() => seasonOptions(new Date()));
  const [name, setName] = useState("");
  const [season, setSeason] = useState(seasons[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const group = await createGroup(name.trim(), season);
      router.push(groupHref(group.groupId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the group.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-10 rounded-xl border bg-card p-5">
      <h2 className="text-xl font-semibold uppercase">Start a group</h2>
      <p className="mt-1 text-muted-foreground">You become its organizer and can invite people.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_9rem]">
        <label className="grid gap-1.5 text-sm font-medium">
          Group name
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Season
          <Select value={season} onChange={(e) => setSeason(Number(e.target.value))}>
            {seasons.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </label>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-wrong">
          {error}
        </p>
      )}
      <Button type="submit" className="mt-4 w-full sm:w-auto" disabled={saving || !name.trim()}>
        {saving ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
        Create group
      </Button>
    </form>
  );
}

function ListSkeleton() {
  return (
    <div className="animate-pulse space-y-2 rounded-xl border bg-card p-4">
      <span className="block h-5 w-48 rounded bg-muted" />
      <span className="block h-4 w-32 rounded bg-muted" />
      <span className="sr-only">Loading your groups</span>
    </div>
  );
}
