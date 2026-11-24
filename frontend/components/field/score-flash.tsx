"use client";

import { type ReactNode, useState } from "react";

import { cn } from "@/lib/utils";

/** Lights up when `value` changes after the first render, so a live score catches the eye. */
export function ScoreFlash({ value, className, children }: { value: string | number | null; className?: string; children: ReactNode }) {
  const [first] = useState(value);
  return (
    <span key={value ?? ""} className={cn(className, value !== first && "animate-flash rounded-sm")}>
      {children}
    </span>
  );
}
