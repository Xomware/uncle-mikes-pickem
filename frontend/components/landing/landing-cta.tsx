"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/use-auth";
import { DEFAULT_NEXT } from "@/lib/auth/next-path";

export function LandingCta() {
  const auth = useAuth();

  // Same height as the button, so nothing jumps when the session resolves.
  if (auth.status === "loading") return <div className="h-12" aria-busy="true" />;

  if (auth.status === "signedIn") {
    return (
      <Link href={DEFAULT_NEXT} className={buttonVariants({ size: "lg", className: "w-full font-semibold sm:w-auto" })}>
        Go to my groups
        <ArrowRight aria-hidden="true" />
      </Link>
    );
  }

  return <GoogleSignInButton nextPath={DEFAULT_NEXT} />;
}
