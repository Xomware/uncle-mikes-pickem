"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/use-auth";
import { DEFAULT_NEXT } from "@/lib/auth/next-path";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/groups/", label: "My groups" },
  { href: "/profile/", label: "Profile" },
];

export function AppHeader() {
  const pathname = usePathname();
  const auth = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    // Amplify redirects to the Hosted UI logout and back to the site root.
    await auth.signOut().catch(() => setSigningOut(false));
  }

  return (
    <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 sm:px-6">
        <Brand href={DEFAULT_NEXT} className="mr-auto" />
        <nav aria-label="Main" className="flex items-center">
          {NAV.map(({ href, label }) => {
            const active = pathname === href || pathname === href.slice(0, -1);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center border-b-2 whitespace-nowrap border-transparent px-3 text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/60",
                  active && "border-primary text-foreground",
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        {auth.status === "signedIn" && (
          <Button variant="ghost" size="icon-lg" className="size-11" onClick={signOut} disabled={signingOut}>
            <LogOut aria-hidden="true" />
            <span className="sr-only">Sign out</span>
          </Button>
        )}
      </div>
    </header>
  );
}
