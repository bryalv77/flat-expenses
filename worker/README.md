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

## Migrating from Firebase

`scripts/migrate/run.ts` copies the Firebase Auth users, the whole Firestore database and the Storage files to Postgres and R2.
**Dry run by default**: it reads Firebase and prints counts and an issues report, and writes nothing without `--apply`.
It never overwrites rows that already exist, never prints or saves password hashes, and can be re-run (copied files are tracked in a manifest).

```
pnpm migrate:firebase --emulator --project demo-costos                       # dry run against the local emulators
pnpm migrate:firebase --emulator --project demo-costos --database-url <url> --apply --verify
pnpm migrate:firebase --database-url <neon url> --r2 remote --apply --verify   # the real thing
```

What it does: every Auth user becomes a Better Auth `user` + `account` (email/password keeps its Firebase hash, Google/Apple become linked
accounts); houses, members, categories, bills (+ attachments), payments, invites and identity documents go to their tables in **one transaction**;
Storage objects are copied to R2 with the same keys. Rows that Postgres cannot hold are skipped and listed; ids that are not UUIDs
(Firestore auto-ids) get a stable UUID derived from the old id (a house id change also moves its files to `houses/<new id>/`).
`last-report.json` lists every skip, repair and warning.

**Passwords.** The Worker accepts a user's Firebase password hash at their first sign-in and replaces it with a Better Auth hash. It needs the
project's hash parameters (Firebase console > Authentication > Users > menu > *Password hash parameters*):

```
wrangler secret put FIREBASE_SCRYPT_SIGNER_KEY --env=""       # base64_signer_key
wrangler secret put FIREBASE_SCRYPT_SALT_SEPARATOR --env=""   # base64_salt_separator
# only if different from the defaults: FIREBASE_SCRYPT_ROUNDS (8) and FIREBASE_SCRYPT_MEM_COST (14)
```

**Rehearsal** (no credentials needed, touches nothing real): `firebase emulators:start --only auth,firestore,storage --project demo-costos`,
`node ../scripts/seed-demo.mjs --emulator`, migrate with `--emulator --apply` into a scratch database, start the Worker with
`wrangler dev --env local --port 8788 --var DATABASE_URL:<scratch db> --var FIREBASE_SCRYPT_SIGNER_KEY:<REHEARSAL_PARAMS.signerKey> --var FIREBASE_SCRYPT_SALT_SEPARATOR:Bw==`
and run `node --experimental-strip-types --no-warnings scripts/migrate/rehearsal-verify.ts`.

**Real run needs**: Application Default Credentials able to read Auth, Firestore and Storage (`gcloud auth application-default login`, or
`GOOGLE_APPLICATION_CREDENTIALS=<service account json>`), the hash parameters above set as Worker secrets, and the Worker redeployed with this code.
Users who only ever signed in with Google/Apple are migrated with a linked account but cannot sign in on the new backend until social sign-in exists there.

