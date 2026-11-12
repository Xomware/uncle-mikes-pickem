// next.config.ts refuses to build without these, so they are always strings in the bundle.
declare namespace NodeJS {
  interface ProcessEnv {
    readonly NEXT_PUBLIC_COGNITO_USER_POOL_ID: string;
    readonly NEXT_PUBLIC_COGNITO_CLIENT_ID: string;
    readonly NEXT_PUBLIC_COGNITO_DOMAIN: string;
    readonly NEXT_PUBLIC_API_URL: string;
  }
}
