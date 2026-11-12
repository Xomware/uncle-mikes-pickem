# Uncle Mike's NFL Pick Em: frontend

Next 16 static export (`out/`), Tailwind 4, shadcn, Amplify v6 Cognito Hosted UI with Google, vitest.

```bash
npm ci
npm run dev    # needs the env below
npm test
npm run build
```

## Env

`next.config.ts` refuses to build or start unless all four are set. None are secret; they ship in the bundle.

| Var | Example |
|---|---|
| `NEXT_PUBLIC_COGNITO_USER_POOL_ID` | `us-east-1_AbCdEf123` |
| `NEXT_PUBLIC_COGNITO_CLIENT_ID` | the `pickem-client` app client id |
| `NEXT_PUBLIC_COGNITO_DOMAIN` | Hosted UI host only, no `https://` |
| `NEXT_PUBLIC_API_URL` | API base URL, no trailing slash |

Locally, put them in `.env.local`.

## Routes

Static export, so ids go in the query string (`/group/?id=...`), never in the path. `app/(authed)/` pages sit behind
`AuthGuard`, which is UX only; the API's Cognito authorizer is what protects data.
