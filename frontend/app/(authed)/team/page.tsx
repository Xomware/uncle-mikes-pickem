import type { Metadata } from "next";
import { Suspense } from "react";

import { TeamView } from "@/components/teams/team-view";

export const metadata: Metadata = { title: "Team" };

// ?team= and ?groupId= are only known in the browser; Suspense lets the rest of the page prerender.
export default function TeamPage() {
  return (
    <Suspense>
      <TeamView />
    </Suspense>
  );
}
