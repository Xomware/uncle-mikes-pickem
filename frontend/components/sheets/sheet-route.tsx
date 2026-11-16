"use client";

import { useSearchParams } from "next/navigation";

import { GroupSheet } from "@/components/sheets/group-sheet";
import { WeekSheet } from "@/components/sheets/week-sheet";

export function SheetRoute() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const week = Number(params.get("week")) || undefined;
  return params.get("all") === "1" ? <GroupSheet id={id} week={week} /> : <WeekSheet id={id} week={week} />;
}
