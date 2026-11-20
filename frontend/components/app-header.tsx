"use client";

import { Binoculars, CalendarDays, ListOrdered, LogOut, Shield, TriangleAlert, UserRound, UsersRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/use-auth";
import { DEFAULT_NEXT } from "@/lib/auth/next-path";
import { useFlags, useSuperAdmin } from "@/lib/flags";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/slate/", label: "Slate", icon: CalendarDays },
  { href: "/groups/", label: "Groups", icon: UsersRound },
  { href: "/teams/", label: "Teams", icon: Shield },
  { href: "/leaderboard/", label: "Leaders", icon: ListOrdered },
  { href: "/profile/", label: "Profile", icon: UserRound },
];
const PRESS_BOX = { href: "/super/", label: "Press Box", icon: Binoculars };

export function AppHeader() {
  const pathname = usePathname();
  const auth = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const { maintenanceBanner } = useFlags();
  // Only the super admin gets a 200 from /super/overview, so only they see the link.
  const superAdmin = useSuperAdmin();
  const items = superAdmin ? [...NAV, PRESS_BOX] : NAV;

  async function signOut() {
    setSigningOut(true);
    // Amplify redirects to the Hosted UI logout and back to the site root.
    await auth.signOut().catch(() => setSigningOut(false));
  }

  return (
    <header className="endzone">
      <div className="mx-auto flex max-w-5xl items-center gap-1 px-3 py-2 sm:px-6">
        <Brand href={DEFAULT_NEXT} className="mr-auto" />
        <nav aria-label="Main" className="flex items-center">
          {items.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname === href.slice(0, -1);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 min-w-11 items-center justify-center border-b-[3px] border-transparent px-0 font-display text-base font-bold tracking-wider whitespace-nowrap text-chalk/80 uppercase outline-none hover:text-chalk focus-visible:ring-3 focus-visible:ring-ring/60 sm:px-3",
                  // The yellow first-down line marks where you are.
                  active && "border-primary text-chalk",
                )}
              >
                {/* No room for three words beside the brand on a phone, so links show only their icon there. */}
                <Icon className="size-5 sm:hidden" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">{label}</span>
              </Link>
            );
          })}
        </nav>
        {auth.status === "signedIn" && (
          <Button variant="ghost" size="icon-lg" className="size-11 text-chalk/80 hover:bg-chalk/10" onClick={signOut} disabled={signingOut}>
            <LogOut aria-hidden="true" />
            <span className="sr-only">Sign out</span>
          </Button>
        )}
      </div>
      {maintenanceBanner && (
        <p role="status" className="flex items-center justify-center gap-2 bg-primary px-4 py-2 text-center text-sm font-semibold text-primary-foreground">
          <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
          {maintenanceBanner}
        </p>
      )}
    </header>
  );
}
