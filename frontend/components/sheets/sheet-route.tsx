"use client";

import { useSearchParams } from "next/navigation";

import { WeekSheet } from "@/components/sheets/week-sheet";

export function SheetRoute() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const week = Number(params.get("week")) || undefined;
  return <WeekSheet id={id} week={week} />;
}
