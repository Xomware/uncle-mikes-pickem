import { AppHeader } from "@/components/app-header";
import { AuthGuard } from "@/components/auth/auth-guard";

export default function AuthedLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col">
        <AuthGuard>{children}</AuthGuard>
      </main>
    </>
  );
}
