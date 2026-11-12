import type { Metadata } from "next";
import { Suspense } from "react";

import { GameView } from "@/components/game/game-view";

export const metadata: Metadata = { title: "Game" };

// ?groupId= and ?gameId= are only known in the browser; Suspense lets the rest of the page prerender.
export default function GamePage() {
  return (
    <Suspense>
      <GameView />
    </Suspense>
  );
}
