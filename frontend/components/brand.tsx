import Link from "next/link";

import { Goalpost } from "@/components/field/icons";
import { cn } from "@/lib/utils";

interface BrandProps {
  href: string;
  className?: string;
}

/** Goalpost mark and the end-zone wordmark, linking home. */
export function Brand({ href, className }: BrandProps) {
  return (
    <Link
      href={href}
      aria-label="Uncle Mike's Pick Em, home"
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/60",
        className,
      )}
    >
      <Goalpost className="h-9 w-7 shrink-0 text-primary" />
      <span className="flex flex-col leading-none">
        <span className="paint worn text-[1.6rem] tracking-[0.02em] whitespace-nowrap">Uncle Mike&apos;s</span>
        <span className="chalk mt-0.5 text-[0.68rem] tracking-[0.42em]">Pick Em</span>
      </span>
    </Link>
  );
}
