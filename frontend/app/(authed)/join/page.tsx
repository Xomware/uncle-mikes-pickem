import type { Metadata } from "next";
import { Suspense } from "react";

import { JoinInvite } from "@/components/groups/join-invite";

export const metadata: Metadata = { title: "Join a group" };

// ?code= is only known in the browser; Suspense lets the rest of the page prerender.
export default function JoinPage() {
  return (
    <Suspense>
      <JoinInvite />
    </Suspense>
  );
}
