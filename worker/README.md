# costos-piso-api

Cloudflare Worker (Hono) + Neon Postgres (Drizzle) + Better Auth. Design and phases: issue #7 (and #8 for the local mode).
Independent package: it is excluded from the app's tsconfig, jest and eslint.

```
cd worker
pnpm install
pnpm test                # vitest; route tests use a local Postgres (costos_piso_test) and skip themselves without one
                         # TEST_DATABASE_URL=<neon url> pnpm test  runs them on an existing database instead (exercises the Neon HTTP driver;
                         # the tests leave their data behind, so use a throwaway branch or an empty database)
pnpm typecheck
cp .dev.vars.example .dev.vars   # DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL
pnpm db:migrate          # applies migrations/ to DATABASE_URL (Neon)
pnpm dev                 # wrangler dev on :8787
```

Secrets in production: `wrangler secret put DATABASE_URL` / `BETTER_AUTH_SECRET`.
Regenerate the Better Auth tables after changing `src/auth.ts`:
`pnpm dlx @better-auth/cli@latest generate --config auth.cli.ts --output src/db/auth-schema.ts -y`, then `pnpm db:generate`.
