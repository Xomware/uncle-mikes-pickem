import { LightBank } from "@/components/field/icons";
import { ResultMark } from "@/components/field/result-mark";
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

function points(row: Row): string {
  if (row.result === "pending") return "--";
  return row.result === "correct" ? String(row.confidence) : "0";
}

const total = ROWS.reduce((n, r) => n + (r.result === "correct" ? r.confidence : 0), 0);

/** A made-up week on the scoreboard, to show what a pick sheet looks like before anyone has one. */
export function ExampleSheet() {
  return (
    <figure className="scoreboard p-3 sm:p-4">
      <figcaption className="flex items-baseline justify-between border-b border-white/10 px-1 pb-2">
        <span className="led text-2xl">WEEK 7</span>
        <span className="font-display text-sm font-bold tracking-[0.2em] text-muted-foreground uppercase">
          Example week
        </span>
      </figcaption>
      <ol className="mt-2 space-y-1.5">
        {ROWS.map((row) => (
          <li
            key={row.confidence}
            className={cn(
              "flex min-h-14 items-center gap-3 rounded-md px-2 py-1.5",
              row.result === "correct" && "bg-correct-muted",
              row.result === "wrong" && "bg-wrong-muted",
              row.result === "pending" && "bg-white/5",
            )}
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm bg-turf font-stencil text-2xl font-black text-chalk shadow-[inset_0_-3px_0_var(--chalk)]">
              <span className="sr-only">Confidence </span>
              {row.confidence}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="font-display text-xl font-extrabold">{row.pick}</span>
              <span className="text-muted-foreground"> over {row.over}</span>
              {row.gow && (
                <span className="mt-0.5 flex w-fit items-center gap-1 font-display text-xs font-bold tracking-[0.18em] text-primary uppercase">
                  <LightBank className="size-3.5" />
                  Primetime
                </span>
              )}
            </span>
            {row.result === "pending" ? (
              <span className="text-sm text-muted-foreground">Not played</span>
            ) : (
              <ResultMark result={row.result} className="text-lg" />
            )}
            <span className="led w-9 text-right text-2xl">{points(row)}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 flex items-baseline justify-between border-t border-white/10 px-1 pt-2">
        <span className="font-display text-sm font-bold tracking-[0.2em] text-muted-foreground uppercase">Total</span>
        <span className="led text-3xl">{total}</span>
      </p>
    </figure>
  );
}
