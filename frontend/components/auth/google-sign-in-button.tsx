"use client";

import { LoaderCircle } from "lucide-react";
import { useState } from "react";

import { GoogleMark } from "@/components/auth/google-mark";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/use-auth";

interface GoogleSignInButtonProps {
  /** Where to land after sign-in. Defaults to the current page. */
  nextPath?: string;
  className?: string;
}

export function GoogleSignInButton({ nextPath, className }: GoogleSignInButtonProps) {
  const { signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle(nextPath);
    } catch (err) {
      // On success the page navigates away, so only a failure gets here.
      setError(err instanceof Error ? err.message : "Could not reach Google sign-in.");
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <Button size="lg" className="w-full font-semibold sm:w-auto" onClick={start} disabled={busy}>
        {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <GoogleMark />}
        {busy ? "Opening Google..." : "Continue with Google"}
      </Button>
      {error && (
        <p role="alert" className="mt-3 text-sm text-wrong">
          {error}
        </p>
      )}
    </div>
  );
}
