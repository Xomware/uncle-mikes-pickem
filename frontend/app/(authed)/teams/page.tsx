import type { Metadata } from "next";
import { Suspense } from "react";

import { TeamsIndex } from "@/components/teams/teams-index";

export const metadata: Metadata = { title: "Teams" };

// ?groupId= is only known in the browser; Suspense lets the rest of the page prerender.
export default function TeamsPage() {
  return (
    <Suspense>
      <TeamsIndex />
    </Suspense>
  );
}
