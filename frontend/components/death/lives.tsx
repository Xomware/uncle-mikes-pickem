import { Heart } from "lucide-react";

import { cn } from "@/lib/utils";

export function Lives({ left, total }: { left: number; total: number }) {
  return (
    <span className="flex shrink-0 gap-0.5" role="img" aria-label={`${left} of ${total} ${total === 1 ? "life" : "lives"} left`}>
      {Array.from({ length: total }, (_, i) => (
        <Heart
          key={i}
          aria-hidden="true"
          className={cn("size-4", i < left ? "fill-wrong text-wrong" : "text-muted-foreground")}
        />
      ))}
    </span>
  );
}
