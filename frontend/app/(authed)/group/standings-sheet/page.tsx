import type { Metadata } from "next";
import { Suspense } from "react";

import { StandingsSheet } from "@/components/sheets/standings-sheet";

export const metadata: Metadata = { title: "Standings sheet" };

// ?id= and ?week= are only known in the browser; Suspense lets the rest of the page prerender.
export default function StandingsSheetPage() {
  return (
    <Suspense>
      <StandingsSheet />
    </Suspense>
  );
}
