"use client";

import Image from "next/image";
import { useState } from "react";

import { initials } from "@/lib/game";
import { cn } from "@/lib/utils";

/** A player's ESPN headshot in a circle; their initials when ESPN has no photo. Decorative: the name is beside it. */
export function Headshot({ name, src, className }: { name: string; src: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={cn("relative inline-flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary ring-1 ring-white/15", className)}>
      {failed ? (
        <span aria-hidden="true" className="font-display text-base font-extrabold text-muted-foreground">
          {initials(name)}
        </span>
      ) : (
        // ESPN's headshots are 350x254 with the face near the top; cover crops to it.
        <Image src={src} alt="" fill sizes="44px" unoptimized onError={() => setFailed(true)} className="object-cover object-top" />
      )}
    </span>
  );
}
