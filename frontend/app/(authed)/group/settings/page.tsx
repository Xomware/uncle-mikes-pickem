import type { Metadata } from "next";
import { Suspense } from "react";

import { GroupSettings } from "@/components/groups/group-settings";

export const metadata: Metadata = { title: "Group settings" };

// ?id= is only known in the browser; Suspense lets the rest of the page prerender.
export default function GroupSettingsPage() {
  return (
    <Suspense>
      <GroupSettings />
    </Suspense>
  );
}
