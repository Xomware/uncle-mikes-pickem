import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

// public/brand/wordmark.svg's viewBox, drawn by scripts/brand.mjs.
const WORDMARK_RATIO = 321.6 / 83.6;

const NAME = "Uncle Mike's NFL Pick Em";

const SIZES = {
  header: { crest: 40, wordmark: 24 },
  hero: { crest: 96, wordmark: 60 },
} as const;

interface BrandProps {
  href: string;
  size?: keyof typeof SIZES;
  className?: string;
}

export function Brand({ href, size = "header", className }: BrandProps) {
  const s = SIZES[size];
  const hero = size === "hero";
  return (
    <Link
      href={href}
      aria-label={NAME}
      className={cn(
        "inline-flex min-h-11 w-fit items-center gap-2 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/60",
        hero && "gap-3 sm:gap-4",
        className,
      )}
    >
      <Image
        src="/brand/crest.svg"
        alt=""
        width={s.crest}
        height={s.crest}
        preload={hero}
        className={cn("shrink-0", hero && "sm:size-28")}
      />
      <Image
        src="/brand/wordmark.svg"
        alt=""
        width={Math.round(s.wordmark * WORDMARK_RATIO)}
        height={s.wordmark}
        preload={hero}
        className={cn(
          "h-auto",
          hero ? "w-[min(232px,calc(100vw-160px))] sm:w-[280px]" : "w-[92px] max-[379px]:hidden sm:w-[108px]",
        )}
      />
    </Link>
  );
}
