import { cn } from "@/lib/utils";

/**
 * Lives as scoreboard timeout bars, lit while unused. With no second life there is
 * nothing to spend, so it only renders when the group gives one.
 */
export function Lives({ left, total }: { left: number; total: number }) {
  if (total < 2) return null;
  return (
    <span className="flex shrink-0 gap-1" role="img" aria-label={`${left} of ${total} lives left`}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 w-4 rounded-full",
            i < left ? "bg-led shadow-[0_0_6px_var(--led)]" : "bg-white/15",
          )}
        />
      ))}
    </span>
  );
}
