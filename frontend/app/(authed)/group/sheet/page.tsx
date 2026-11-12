import type { Metadata } from "next";
import { Suspense } from "react";

import { SheetRoute } from "@/components/sheets/sheet-route";

export const metadata: Metadata = { title: "Pick sheet" };

// ?id=, ?week= and ?all= are only known in the browser; Suspense lets the rest of the page prerender.
export default function SheetPage() {
  return (
    <Suspense>
      <SheetRoute />
    </Suspense>
  );
}
