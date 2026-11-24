"use client";

import { CircleAlert, CircleCheck, Copy, LoaderCircle } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { type GroupSummary, setPicks } from "@/lib/api/client";
import { type Sheet, toPayload } from "@/lib/picks";

type Copied = Record<string, { kind: "busy" } | { kind: "done" } | { kind: "failed"; message: string }>;

/** Saves the same sheet into the caller's other groups, one at a time, so each can fail on its own terms. */
export function CopyPicks({ sheet, week, groups }: { sheet: Sheet; week: number; groups: GroupSummary[] }) {
  const [copied, setCopied] = useState<Copied>({});

  async function copy(groupId: string) {
    setCopied((c) => ({ ...c, [groupId]: { kind: "busy" } }));
    const { picks, tiebreak } = toPayload(sheet);
    try {
      await setPicks(groupId, week, picks, tiebreak);
      setCopied((c) => ({ ...c, [groupId]: { kind: "done" } }));
    } catch (err) {
      setCopied((c) => ({ ...c, [groupId]: { kind: "failed", message: err instanceof Error ? err.message : "Couldn't copy." } }));
    }
  }

  return (
    <section className="panel mt-4 p-4" aria-labelledby="copy-title">
      <h2 id="copy-title" className="font-display text-lg font-bold tracking-wide uppercase">
        Same picks in your other groups?
      </h2>
      <p className="text-sm text-muted-foreground">Each group keeps its own sheet. Copying replaces what you have there for Week {week}.</p>
      <ul className="mt-3 divide-y divide-border">
        {groups.map((g) => {
          const state = copied[g.groupId];
          return (
            <li key={g.groupId} className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="min-w-0 flex-1 truncate font-semibold">{g.name}</span>
              {state?.kind === "done" ? (
                <span role="status" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                  <CircleCheck className="size-4" aria-hidden="true" />
                  Copied
                </span>
              ) : (
                <Button size="sm" variant="outline" disabled={state?.kind === "busy"} onClick={() => copy(g.groupId)}>
                  {state?.kind === "busy" ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  Copy here
                </Button>
              )}
              {state?.kind === "failed" && (
                <p role="alert" className="flex w-full items-center gap-1.5 text-sm text-wrong">
                  <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
                  {state.message}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
