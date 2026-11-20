import type { ReactNode } from "react";

import { LoadError } from "@/components/load-error";
import type { Load } from "@/lib/api/use-load";
import { cn } from "@/lib/utils";

interface LoadedProps<T> {
  load: Load<T>;
  retry: () => void;
  /** Finishes "Loading ..." and "Couldn't load ...". */
  what: string;
  /** The skeleton's height class. */
  height?: string;
  children: (data: T) => ReactNode;
}

/** A useLoad result: a skeleton, an error with a retry, or the children with the data. */
export function Loaded<T>({ load, retry, what, height = "h-36", children }: LoadedProps<T>) {
  if (load.status === "loading") {
    return (
      <div className={cn("animate-pulse rounded-lg bg-board", height)}>
        <span className="sr-only" role="status">
          Loading {what}
        </span>
      </div>
    );
  }
  if (load.status === "error") {
    return <LoadError title={`Couldn't load ${what}`} message={load.message} onRetry={retry} />;
  }
  return children(load.data);
}
