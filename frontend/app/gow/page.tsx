import type { Metadata } from "next";
import { Suspense } from "react";

import { GowConfirm } from "@/components/gow/gow-confirm";

export const metadata: Metadata = { title: "Game of the Week", robots: { index: false } };

// Outside (authed): the admin email's signed token is the credential, so no sign-in.
// ?t= is only known in the browser; Suspense lets the rest of the page prerender.
export default function GowPage() {
  return (
    <Suspense>
      <GowConfirm />
    </Suspense>
  );
}
