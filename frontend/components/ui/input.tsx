import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

// 44px tall like the buttons; text-base stops iOS Safari zooming on focus.
export const fieldClass =
  "h-11 w-full min-w-0 rounded-lg border border-input bg-input/30 px-3 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/60 disabled:opacity-50 aria-invalid:border-destructive";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input data-slot="input" className={cn(fieldClass, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select data-slot="select" className={cn(fieldClass, "pr-8", className)} {...props} />;
}
