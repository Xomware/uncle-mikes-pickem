import Link from "next/link";

import { cn } from "@/lib/utils";

interface BrandProps {
  href: string;
  className?: string;
}

export function Brand({ href, className }: BrandProps) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex min-h-11 flex-col justify-center rounded-md leading-none outline-none focus-visible:ring-3 focus-visible:ring-ring/60",
        className,
      )}
    >
      <span className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">Uncle Mike&apos;s</span>
      <span className="font-display text-xl font-bold tracking-wide uppercase">NFL Pick Em</span>
    </Link>
  );
}
