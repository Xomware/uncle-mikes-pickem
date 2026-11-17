import type { Metadata } from "next";

import { PressBox } from "@/components/super/press-box";

export const metadata: Metadata = { title: "Press Box", robots: { index: false } };

export default function SuperPage() {
  return <PressBox />;
}
