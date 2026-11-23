# costos-piso-api (Cuota API)

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

Live at https://api-cuota.devalv.com (also https://costos-piso-api.bryalv77.workers.dev; Cloudflare account of `bryalv77`). The web app is https://app-cuota.devalv.com and the landing https://cuota.devalv.com. Neon project `costos-piso` (eu-central-1, main branch),
R2 bucket `costos-piso-files` (EU jurisdiction, fixed at creation). Deploy with `pnpm deploy`; secrets are `DATABASE_URL`, `BETTER_AUTH_SECRET`
and `BETTER_AUTH_URL` (`wrangler secret put NAME --env=""`). Apply new migrations to Neon with
`DATABASE_URL=<neon url> pnpm db:migrate` before deploying code that needs them.

### Password reset emails

`POST /api/auth/request-password-reset` emails a one-hour link (Spanish, or English for users whose locale is `en`) that goes through the Worker
and redirects to `https://app-cuota.devalv.com/reset-password?token=…` (the client sends `redirectTo`, default `EXPO_PUBLIC_WEB_URL`; the origin must be in `WEB_ORIGINS` in `src/auth.ts`). Real sending is off until you have a sending domain verified at Resend:

```
wrangler secret put RESEND_API_KEY --env=""
wrangler secret put EMAIL_FROM --env=""     # e.g. Cuota <noreply@yourdomain.com>
```

Without them nothing is sent and the link is never logged. `EMAIL_MODE=log` (in `.dev.vars.local`) prints the email to the console for local development.
