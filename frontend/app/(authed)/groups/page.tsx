import type { Metadata } from "next";

import { GroupsView } from "@/components/groups/groups-view";

export const metadata: Metadata = { title: "My groups" };

export default function GroupsPage() {
  return <GroupsView />;
}
