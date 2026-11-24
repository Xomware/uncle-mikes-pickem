import type { Metadata } from "next";
import { Suspense } from "react";

import { PlayerView } from "@/components/player/player-view";

export const metadata: Metadata = { title: "Player" };

// ?sub= and ?g= are only known in the browser; Suspense lets the rest of the page prerender.
export default function PlayerPage() {
  return (
    <Suspense>
      <PlayerView />
    </Suspense>
  );
}
