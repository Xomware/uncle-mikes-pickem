"use client";

import { CircleAlert, LoaderCircle, UserPlus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { type EntryType, acceptInvite } from "@/lib/api/client";
import { groupHref } from "@/lib/groups";
import { cn } from "@/lib/utils";

const ENTRIES: { value: EntryType; title: string; detail: string }[] = [
  { value: "season", title: "Season", detail: "Weekly pot and the yearly pot. Pays both fees." },
  { value: "weekly", title: "Weekly only", detail: "Weekly pot only. Pays the weekly fee." },
];

export function JoinInvite() {
  const code = useSearchParams().get("code")?.trim() ?? "";
  const router = useRouter();
  const [entryType, setEntryType] = useState<EntryType>("season");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(code ? null : "This link has no invite code in it.");

  async function join() {
    setJoining(true);
    setError(null);
    try {
      const group = await acceptInvite(code, entryType);
      router.replace(groupHref(group.groupId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join the group.");
      setJoining(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12">
      <div className="rounded-xl border bg-card p-6">
        <UserPlus className="size-6 text-primary" aria-hidden="true" />
        <h1 className="mt-3 text-2xl font-bold uppercase">You&apos;re invited</h1>
        <p className="mt-2 leading-relaxed text-muted-foreground">
          Join the group to make weekly picks and see the standings.
        </p>
        <fieldset className="mt-5 grid gap-2">
          <legend className="mb-2 text-sm font-medium">How are you playing?</legend>
          {ENTRIES.map((e) => (
            <label
              key={e.value}
              className={cn(
                "flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border p-3 has-focus-visible:ring-3 has-focus-visible:ring-ring/60",
                entryType === e.value && "border-primary bg-primary/10",
              )}
            >
              <input
                type="radio"
                name="entryType"
                value={e.value}
                checked={entryType === e.value}
                onChange={() => setEntryType(e.value)}
                className="mt-1 size-4 accent-primary"
              />
              <span>
                <span className="block font-semibold">{e.title}</span>
                <span className="text-sm text-muted-foreground">{e.detail}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {error && (
          <p role="alert" className="mt-4 flex items-start gap-2 text-wrong">
            <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}
        <Button className="mt-6 w-full" onClick={join} disabled={!code || joining}>
          {joining && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {joining ? "Joining" : "Join group"}
        </Button>
      </div>
    </div>
  );
}
