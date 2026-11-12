import { Check, Clock, X } from "lucide-react";

import { cn } from "@/lib/utils";

type Result = "correct" | "wrong" | "pending";

interface Row {
  confidence: number;
  pick: string;
  over: string;
  result: Result;
  gow?: boolean;
}

const ROWS: Row[] = [
  { confidence: 16, pick: "KC", over: "BUF", result: "correct", gow: true },
  { confidence: 15, pick: "DET", over: "GB", result: "wrong" },
  { confidence: 14, pick: "PHI", over: "DAL", result: "correct" },
  { confidence: 13, pick: "BAL", over: "PIT", result: "pending" },
];

const RESULT = {
  correct: { icon: Check, label: "Correct", className: "bg-correct-muted text-correct" },
  wrong: { icon: X, label: "Wrong", className: "bg-wrong-muted text-wrong" },
  pending: { icon: Clock, label: "Not played", className: "bg-muted text-muted-foreground" },
} as const;

function points(row: Row): string {
  if (row.result === "pending") return "-";
  return row.result === "correct" ? `+${row.confidence}` : "0";
}

/** A made-up week, to show what a pick sheet looks like before anyone has one. */
export function ExampleSheet() {
  return (
    <figure className="rounded-xl border bg-card p-4">
      <figcaption className="mb-3 flex items-baseline justify-between">
        <span className="font-display text-lg font-semibold tracking-wide uppercase">Example week</span>
        <span className="text-sm text-muted-foreground">Confidence 16 to 1</span>
      </figcaption>
      <ol className="space-y-2">
        {ROWS.map((row) => {
          const r = RESULT[row.result];
          return (
            <li key={row.confidence} className="flex items-center gap-3 rounded-lg bg-background/60 px-3 py-2">
              <span className="w-8 text-center font-display text-2xl font-bold tabular-nums">{row.confidence}</span>
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{row.pick}</span>
                <span className="text-muted-foreground"> over {row.over}</span>
                {row.gow && (
                  <span className="mt-1 block w-fit rounded-sm bg-primary/15 px-1.5 py-0.5 text-xs font-semibold text-primary uppercase">
                    Game of the Week
                  </span>
                )}
              </span>
              <span
                className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold", r.className)}
              >
                <r.icon className="size-4" aria-hidden="true" />
                <span className="sr-only">{r.label}, </span>
                <span className="tabular-nums">{points(row)}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </figure>
  );
}
