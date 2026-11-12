import type { Metadata } from "next";
import { Suspense } from "react";

import { SeasonStandingsView } from "@/components/results/season-standings";

export const metadata: Metadata = { title: "Standings" };

// ?id= is only known in the browser; Suspense lets the rest of the page prerender.
export default function StandingsPage() {
  return (
    <Suspense>
      <SeasonStandingsView />
    </Suspense>
  );
}
