import { type ReactNode, useId } from "react";

import { cn } from "@/lib/utils";

interface BoardProps {
  title: string;
  /** A small link set against the title, like "Full table". */
  link?: ReactNode;
  children: ReactNode;
}

/** A small scoreboard with an LED title. */
export function Board({ title, link, children }: BoardProps) {
  const id = useId();
  return (
    <section className="scoreboard p-4" aria-labelledby={id}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 id={id} className="led text-xl uppercase">
          {title}
        </h2>
        {link}
      </div>
      {children}
    </section>
  );
}

interface StatProps {
  label: string;
  value: string;
  note?: string;
  className?: string;
}

/** One number on a scoreboard. Goes inside a <dl>. */
export function Stat({ label, value, note, className }: StatProps) {
  return (
    <div className={cn("min-w-0 rounded-md border border-white/10 bg-white/[0.03] p-2", className)}>
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className="led truncate text-xl sm:text-2xl">{value}</dd>
      {note && <dd className="truncate text-xs text-muted-foreground">{note}</dd>}
    </div>
  );
}
