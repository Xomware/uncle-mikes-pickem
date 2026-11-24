"use client";

import { Check, Share2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import type { GroupSummary, WeekView } from "@/lib/api/client";
import { picksHref } from "@/lib/picks";

/** Says whose sheet this is, switches to another group's sheet for the same week, and shares it. */
export function PickingFor({ view, groups }: { view: WeekView; groups: GroupSummary[] | null }) {
  const { group, week } = view;
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const others = (groups ?? []).filter((g) => g.season === group.season);

  async function share() {
    const url = new URL(picksHref(group.groupId, week.week), window.location.origin).toString();
    const text = `Week ${week.week} picks are open in ${group.name}.`;
    if (navigator.share) {
      // Dismissing the share sheet rejects; there is nothing to recover.
      await navigator.share({ title: "Uncle Mike's Pick Em", text, url }).catch(() => undefined);
      return;
    }
    await navigator.clipboard.writeText(`${text} ${url}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="scoreboard mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-1">
        <span className="block font-display text-xs font-bold tracking-[0.2em] text-muted-foreground uppercase">You&apos;re picking for</span>
        {others.length > 1 ? (
          <Select
            aria-label="Switch group"
            value={group.groupId}
            onChange={(e) => router.push(picksHref(e.target.value, week.week))}
            className="mt-1 h-10 max-w-full font-display text-lg font-extrabold uppercase"
          >
            {others.map((g) => (
              <option key={g.groupId} value={g.groupId}>
                {g.name}
              </option>
            ))}
          </Select>
        ) : (
          <span className="led block truncate text-2xl leading-tight">{group.name}</span>
        )}
        <span className="mt-1 block text-xs text-muted-foreground">These picks count in this group only.</span>
      </div>
      <Button variant="outline" onClick={share}>
        {copied ? <Check aria-hidden="true" /> : <Share2 aria-hidden="true" />}
        {copied ? "Link copied" : "Share"}
      </Button>
    </div>
  );
}
