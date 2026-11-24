import type { Metadata } from "next";

import { AdminPortal } from "@/components/admin/admin-portal";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

export default function AdminPage() {
  return <AdminPortal />;
}
