"use client";

import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Paper tokens live with the sheets, not in globals.css: the sheet is a light page on the dark
// site, on screen and in print. The <style> unmounts with the page, so @page and the header
// rule never leak onto other routes.
const css = (landscape: boolean) => `
.paper {
  --paper: oklch(0.985 0.006 95);
  --ink: oklch(0.22 0.02 255);
  --ink-soft: oklch(0.45 0.02 255);
  --rule: oklch(0.72 0.01 255);
  --right: oklch(0.9 0.09 150);
  --wrong: oklch(0.89 0.07 25);
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
@page { size: letter ${landscape ? "landscape" : "portrait"}; margin: 0.35in; }
@media print {
  html { color-scheme: light; }
  html, body { background: none !important; }
  body > header { display: none !important; }
}`;

interface PaperProps {
  backHref: string;
  backLabel: string;
  landscape?: boolean;
  /** Extra screen-only actions, e.g. a CSV download. */
  actions?: ReactNode;
  children: ReactNode;
}

/** The screen chrome around a printable sheet: back link, Download PDF, and the paper itself. */
export function Paper({ backHref, backLabel, landscape = false, actions, children }: PaperProps) {
  return (
    <div className={cn("mx-auto w-full px-4 py-6 sm:px-6 print:max-w-none print:p-0", landscape ? "max-w-6xl" : "max-w-3xl")}>
      <style>{css(landscape)}</style>
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Link
          href={backHref}
          className="mr-auto inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {backLabel}
        </Link>
        {actions}
        <Button onClick={() => window.print()}>
          <Printer aria-hidden="true" />
          Download PDF
        </Button>
        <p className="w-full text-right text-xs text-muted-foreground">
          Choose &quot;Save as PDF&quot; in the print dialog.
        </p>
      </div>
      <article className="paper rounded-sm bg-(--paper) p-4 text-(--ink) shadow-lg sm:p-8 print:rounded-none print:bg-transparent print:p-0 print:shadow-none">
        {children}
      </article>
    </div>
  );
}

/** The fill-in blank from the paper sheet; holds the value when there is one. */
export function Blank({ value, className }: { value?: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-block min-w-10 border-b border-(--ink) px-1 text-center font-semibold tabular-nums",
        className,
      )}
    >
      {value ?? " "}
    </span>
  );
}

/** "$1", "$2.50" */
export const dollars = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
