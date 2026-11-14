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

## Production

Live at https://costos-piso-api.bryalv77.workers.dev (Cloudflare account of `bryalv77`). Neon project `costos-piso` (eu-central-1, main branch),
R2 bucket `costos-piso-files` (EU jurisdiction, fixed at creation). Deploy with `pnpm deploy`; secrets are `DATABASE_URL`, `BETTER_AUTH_SECRET`
and `BETTER_AUTH_URL` (`wrangler secret put NAME --env=""`). Apply new migrations to Neon with
`DATABASE_URL=<neon url> pnpm db:migrate` before deploying code that needs them.

