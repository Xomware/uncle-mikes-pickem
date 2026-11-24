import { Suspense } from "react";

import { ActionBanners } from "@/components/action-banners";
import { AppHeader } from "@/components/app-header";
import { AuthGuard } from "@/components/auth/auth-guard";

export default function AuthedLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col pb-(--tabbar-h)">
        <AuthGuard>
          <Suspense>
            <ActionBanners />
          </Suspense>
          {children}
        </AuthGuard>
      </main>
    </>
  );
}
