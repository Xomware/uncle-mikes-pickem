import type { Metadata } from "next";
import { Suspense } from "react";

import { PayView } from "@/components/payments/pay-view";

export const metadata: Metadata = { title: "Pay" };

// ?id= is only known in the browser; Suspense lets the rest of the page prerender.
export default function PayPage() {
  return (
    <Suspense>
      <PayView />
    </Suspense>
  );
}
