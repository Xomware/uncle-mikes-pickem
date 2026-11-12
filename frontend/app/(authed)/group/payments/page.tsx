import type { Metadata } from "next";
import { Suspense } from "react";

import { LedgerView } from "@/components/payments/ledger-view";

export const metadata: Metadata = { title: "Payments" };

// ?id= is only known in the browser; Suspense lets the rest of the page prerender.
export default function PaymentsPage() {
  return (
    <Suspense>
      <LedgerView />
    </Suspense>
  );
}
