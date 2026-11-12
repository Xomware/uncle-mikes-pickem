"use client";

import { Amplify } from "aws-amplify";

// Must match the callback and sign-out URLs on the Cognito app client exactly (copied from reeses).
export const CALLBACK_PATH = "/auth/callback";

// Module scope, not an effect: the API client calls fetchAuthSession outside
// React, and an effect-based config would race a request fired on first render.
// Literal process.env reads, because Next only inlines those; the values are
// guaranteed by the check in next.config.ts.
const origin = typeof window === "undefined" ? "" : window.location.origin;

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID,
      userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID,
      loginWith: {
        oauth: {
          domain: process.env.NEXT_PUBLIC_COGNITO_DOMAIN,
          scopes: ["email", "openid", "profile"],
          // Built from the live origin so one bundle works on localhost and in production.
          redirectSignIn: [`${origin}${CALLBACK_PATH}`],
          redirectSignOut: [origin],
          responseType: "code",
        },
      },
    },
  },
});
