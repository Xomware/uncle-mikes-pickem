import type { Metadata } from "next";

import { GlobalStatsView } from "@/components/stats/global-stats-view";

export const metadata: Metadata = { title: "Stats" };

export default function StatsPage() {
  return <GlobalStatsView />;
}
