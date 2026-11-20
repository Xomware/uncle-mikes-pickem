import Link from "next/link";

import { cn } from "@/lib/utils";

interface BrandProps {
  href: string;
  className?: string;
}

/** The primary logo's goalpost and lettering side by side, linking home. */
export function Brand({ href, className }: BrandProps) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex min-h-11 items-center rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/60",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static export, no image optimizer */}
      <img
        src="/brand/lockup-horizontal.webp"
        alt="Uncle Mike's Pick Em, home"
        width={411}
        height={132}
        className="h-8 w-auto sm:h-11"
      />
    </Link>
  );
}
