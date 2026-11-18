"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/use-auth";
import { DEFAULT_NEXT } from "@/lib/auth/next-path";

interface LandingCtaProps {
  /** The nav bar's short version: "Sign in" or "Open app". */
  compact?: boolean;
}

export function LandingCta({ compact = false }: LandingCtaProps) {
  const auth = useAuth();

  // Same size as the button, so nothing jumps when the session resolves.
  if (auth.status === "loading") return <div className={compact ? "h-11 w-28" : "h-12"} aria-busy="true" />;

  if (auth.status === "signedIn") {
    return (
      <Link
        href={DEFAULT_NEXT}
        className={buttonVariants({ size: compact ? "default" : "lg", className: compact ? "font-semibold" : "w-full font-semibold sm:w-auto" })}
      >
        {compact ? "Open app" : "Go to my groups"}
        <ArrowRight aria-hidden="true" />
      </Link>
    );
  }

  return <GoogleSignInButton nextPath={DEFAULT_NEXT} compact={compact} />;
}
