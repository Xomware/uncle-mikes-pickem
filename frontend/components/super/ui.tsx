import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** A scoreboard number with its caption. */
export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "wrong" }) {
  return (
    <div className="scoreboard flex flex-col gap-1 px-4 py-3">
      <span className={cn("led text-3xl leading-none", tone === "wrong" && "text-wrong")}>{value}</span>
      <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{label}</span>
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="paint worn mt-8 text-3xl leading-none">{children}</h2>;
}

export function Skeleton({ label }: { label: string }) {
  return (
    <div className="animate-pulse space-y-3" aria-busy="true">
      <span className="block h-20 rounded-lg bg-card/70" />
      <span className="block h-40 rounded-xl bg-card/70" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
