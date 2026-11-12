import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface FieldTitleProps {
  children: ReactNode;
  sub?: ReactNode;
  className?: string;
}

/** A page title painted on the grass, with a chalked sub-line. */
export function FieldTitle({ children, sub, className }: FieldTitleProps) {
  return (
    <div className={cn("min-w-0", className)}>
      <h1 className="paint worn text-5xl leading-[0.95] break-words sm:text-6xl">{children}</h1>
      {sub && <p className="chalk mt-2 truncate text-sm tracking-[0.16em]">{sub}</p>}
    </div>
  );
}
