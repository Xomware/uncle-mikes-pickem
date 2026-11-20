import type { Metadata } from "next";
import { Suspense } from "react";

import { SlateView } from "@/components/slate/slate-view";

export const metadata: Metadata = { title: "Slate" };

// ?week= is only known in the browser; Suspense lets the rest of the page prerender.
export default function SlatePage() {
  return (
    <Suspense>
      <SlateView />
    </Suspense>
  );
}
