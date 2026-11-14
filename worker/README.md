# costos-piso-api

Cloudflare Worker (Hono) + Neon Postgres (Drizzle) + Better Auth. Design and phases: issue #7 (and #8 for the local mode).
Independent package: it is excluded from the app's tsconfig, jest and eslint.

```
cd worker
pnpm install
pnpm test                # vitest (no database needed yet)
pnpm typecheck
cp .dev.vars.example .dev.vars   # DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL
pnpm db:migrate          # applies migrations/ to DATABASE_URL (Neon)
pnpm dev                 # wrangler dev on :8787
```

Secrets in production: `wrangler secret put DATABASE_URL` / `BETTER_AUTH_SECRET`.
Regenerate the Better Auth tables after changing `src/auth.ts`:
`pnpm dlx @better-auth/cli@latest generate --config auth.cli.ts --output src/db/auth-schema.ts -y`, then `pnpm db:generate`.
