"use client";

import Image from "next/image";
import { useState } from "react";

import { cn } from "@/lib/utils";

interface Props {
  abbr: string;
  /** ESPN's URL from the GAME item. Without one, ESPN's CDN path for the abbr. */
  logo?: string | null;
  /** Hex without '#', as ESPN sends it. Colors the fallback badge. */
  color?: string | null;
  alternateColor?: string | null;
  className?: string;
}

const cdnLogo = (abbr: string) => `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr.toLowerCase()}.png`;

/**
 * An NFL team's logo, loaded from ESPN at runtime (the repo is public, so the art is never
 * committed). Decorative: callers always print the abbr beside it. If ESPN's image fails,
 * a badge in the team's color with the abbr takes its place.
 */
export function TeamLogo({ abbr, logo, color, alternateColor, className }: Props) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        aria-hidden="true"
        style={color ? { backgroundColor: `#${color}`, color: `#${alternateColor ?? "ffffff"}` } : undefined}
        className={cn(
          "inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-muted font-display text-[0.5rem] leading-none font-extrabold tracking-tight text-foreground ring-1 ring-white/25",
          className,
        )}
      >
        {abbr}
      </span>
    );
  }
  return (
    <Image
      src={logo || cdnLogo(abbr)}
      alt=""
      width={64}
      height={64}
      unoptimized
      onError={() => setFailed(true)}
      // A faint chalk halo keeps dark marks (LV, NE) legible on the dark panels.
      className={cn("size-6 shrink-0 object-contain drop-shadow-[0_0_1px_oklch(0.98_0_0/0.7)]", className)}
    />
  );
}
