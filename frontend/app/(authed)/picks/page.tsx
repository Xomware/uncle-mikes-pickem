import type { Metadata } from "next";
import { Suspense } from "react";

import { PicksWeek } from "@/components/picks/picks-week";

export const metadata: Metadata = { title: "Picks" };

// ?id= and ?week= are only known in the browser; Suspense lets the rest of the page prerender.
export default function PicksPage() {
  return (
    <Suspense>
      <PicksWeek />
    </Suspense>
  );
}
