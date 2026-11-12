import { CircleAlert, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

export function LoadError({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-xl border bg-card p-5">
      <p className="flex items-center gap-2 font-semibold text-wrong">
        <CircleAlert className="size-5" aria-hidden="true" />
        {title}
      </p>
      <p className="mt-1 text-muted-foreground">{message}</p>
      <Button variant="outline" className="mt-4" onClick={onRetry}>
        <RefreshCw aria-hidden="true" />
        Try again
      </Button>
    </div>
  );
}
