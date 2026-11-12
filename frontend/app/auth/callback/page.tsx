import type { Metadata } from "next";

import { AuthCallback } from "@/components/auth/auth-callback";

export const metadata: Metadata = { title: "Signing you in" };

// A real prerendered route, not a rewrite: the callback URL registered on the
// Cognito app client must be an actual file in the bucket so `?code=` survives.
export default function AuthCallbackPage() {
  return <AuthCallback />;
}
