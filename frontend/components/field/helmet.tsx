import { cn } from "@/lib/utils";

interface HelmetProps {
  out?: boolean;
  className?: string;
}

/** A death pool entry: lit under the floodlights while alive, dark with a red slash once out. */
export function Helmet({ out = false, className }: HelmetProps) {
  const shell = out ? "oklch(0.24 0.008 20)" : "oklch(0.92 0.012 240)";
  const shade = out ? "oklch(0.18 0.006 20)" : "oklch(0.72 0.02 240)";
  const mask = out ? "oklch(0.32 0.01 20)" : "oklch(0.55 0.015 240)";
  return (
    <svg
      viewBox="0 0 64 56"
      aria-hidden="true"
      className={cn(out ? "" : "drop-shadow-[0_0_6px_oklch(0.95_0.03_240/0.55)]", className)}
    >
      <path
        d="M8 38C3 22 14 5 33 5c16 0 26 10 27 23v3l-13 2-2 8c-1 4-4 6-8 6H22c-8 0-12-3-14-9z"
        fill={shell}
      />
      <path d="M9 37c4 6 8 8 14 8h14c3 0 5-1 6-4l2-8h-9c-3 6-10 8-18 7-4 0-7-1-9-3z" fill={shade} />
      <path d="M13 14c7-6 18-8 32-5" stroke={out ? "oklch(0.32 0.06 25)" : "var(--blood)"} strokeWidth="4.5" fill="none" />
      {!out && <path d="M16 20c4-6 12-9 20-9" stroke="oklch(1 0 0 / 0.75)" strokeWidth="2.5" strokeLinecap="round" fill="none" />}
      <circle cx="30" cy="31" r="3.4" fill={out ? "oklch(0.12 0 0)" : "oklch(0.3 0.01 240)"} />
      <g stroke={mask} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M46 33h15v12H43M52 33v14M45 39h16M37 47l7-2" />
      </g>
      {out && <path d="M6 50 58 6" stroke="var(--blood)" strokeWidth="5" strokeLinecap="round" />}
    </svg>
  );
}
