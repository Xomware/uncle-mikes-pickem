import type { Metadata } from "next";
import { Suspense } from "react";

import { GroupHome } from "@/components/groups/group-home";

export const metadata: Metadata = { title: "Group" };

// ?id= is only known in the browser; Suspense lets the rest of the page prerender.
export default function GroupPage() {
  return (
    <Suspense>
      <GroupHome />
    </Suspense>
  );
}
