# Cuota

Shared household costs for roommates. One Expo (React Native) codebase for iOS, Android and Web, backed by the Cloudflare Worker API (Neon Postgres + R2; production at api-cuota.devalv.com).

Roles: **admin** (creates the flat, categories, bills, invites, payments) and **roommie** (joins by code, read-only). Currency EUR, stored as integer cents. UI in Spanish (default), English, French, German, Portuguese, Italian and Catalan (see Internationalisation).

## Architecture

- `app/` — Expo Router routes: `(auth)`, `onboarding`, `(app)/(tabs)` (home, expenses, reports, house, profile), bills, categories, members, payments, profile, settings.
- `src/components/ui`, `src/components/charts` — iOS-style design system and SVG charts; `src/theme` — tokens and `useTheme()`.
- `src/features/*` — feature hooks (TanStack Query) plus pure, unit-tested logic: `schedule`, `finance`, `reports`.
- `src/lib` — API client and data layer (Worker API client, local SQLite backend), storage helpers, formatting, UI store (Zustand).
- `worker/` — the Cloudflare Worker API (Hono, Drizzle, Neon Postgres, R2, Better Auth); see `worker/README.md`. `docs/*-api.md` list module APIs.

## API contract

`openapi.yaml` is the single source of truth for the Worker API: paths, request and response schemas, enums and limits. `pnpm gen:api` generates from it the zod schemas, TypeScript types and HTTP client for the app (`src/lib/api/generated`) and the zod schemas and types for the Worker (`worker/src/generated`; the Worker has its own zod install, hence its own copy). Never edit generated files; CI fails when they are out of date.

To change the API: edit `openapi.yaml`, run `pnpm gen:api`, then update the Worker route and `src/lib/apiHttp.ts` the compiler points at. Rules a schema cannot express (a FIXED category needs an amount, language codes in `names`, trimming) live in `src/lib/api/rules.ts`. `src/lib/limits.ts` holds the few limits SQL and the UI need too; `src/lib/api/limits.test.ts` keeps them equal to the contract.

## Run

```bash
pnpm install
cp .env.example .env
pnpm expo start            # i / a / w for iOS, Android, web
pnpm typecheck && pnpm lint && pnpm test
```

## Deploy

```bash
cd worker && pnpm deploy                   # the API (api-cuota.devalv.com); needs `wrangler login`
pnpm deploy:web                            # export web (always against https://api-cuota.devalv.com) + deploy to the Cloudflare Worker `costos-piso` = app-cuota.devalv.com; checks the CSP hash in public/_headers first; needs `wrangler login`
pnpm deploy:mobile ["message"] [--production]   # EAS Update (OTA): preview channel by default
```

## Mobile builds

`pnpm dlx eas-cli build -p ios` / `-p android` (iOS bundle id `com.devalv.costospiso`, Android package `com.costospiso.app`).

## Cloud vs local mode

- **Cloud**: accounts, shared houses and roles, backed by the Worker API (Neon + R2). Data lives on the server.
- **Local**: one device, no account, no network. Houses, bills and payments live in a SQLite database (`expo-sqlite`; WASM on web, where files are stored as blobs in the same DB). Bill photos/PDFs and avatars are files under `Documents/files` on native.
- **Startup is local-first**: a fresh install opens straight into local mode (no login prompt), and a returning cloud account is restored only when a session token is already present. "Log in / Create account" lives in the Profile tab; when a user logs in after using local mode, a sync screen uploads their local houses to the account (additive, per house) or discards the local copy in favour of the cloud data.
- **Backup**: local data is deliberately excluded from OS backup, so the in-app backup export (and CSV export) is the only safety net. iOS: `Documents/SQLite` and `Documents/files` are marked `isExcludedFromBackup` at launch by `plugins/withExcludeLocalDataFromBackup.js`. Android: `android.allowBackup=false` in `app.json` (all-or-nothing: it also drops Android Auto Backup for other app data; SecureStore is not backed up anyway). On web, browser storage can be evicted; export regularly.
- Adding `expo-sqlite` is a native change: it ships in a new store build (version 1.2.0, `runtimeVersion` follows `appVersion`), never via OTA.
- Dev: `pnpm test` (unit plus the contract suite against local SQLite via `better-sqlite3`; install with `--ignore-scripts` is fine, prebuilt binaries load), `pnpm typecheck`, `pnpm lint`. CI (`.github/workflows/ci.yml`) runs typecheck, lint and test.

## Internationalisation

Everything lives in `src/i18n/`:

- `locales.ts` — the **registry** (`code`, native `label`, `intlLocale`, `dir`). `Locale` is derived from it, so the registry is the single source of truth.
- `es.ts` — the source messages (defines the `Messages` shape). `en.ts`, `fr.ts`, `de.ts`, `pt.ts`, `it.ts`, `ca.ts` — one file per language.
- `translate.ts` — pure `translate()` / `translatePlural()` (no React, usable from logic and tests). `index.ts` — the `useT()` hook returning `{ t, tp, locale }`.
- Fallback chain for a missing key: the locale → English → Spanish → the key itself (a dev-only `console.warn` reports the miss). A new language can therefore ship incomplete.
- First run: the device language (`expo-localization`) is matched to the registry, falling back to Spanish. An explicit choice in Settings (or the saved profile language) always wins and is persisted.
- Numbers, money and dates use `Intl` with the registry's `intlLocale` (`src/lib/format.ts`); plurals use `Intl.PluralRules` through keys such as `schedule.week_one` / `schedule.week_other` (`tp('schedule.week', n)`).
- Category names are data, not UI strings. A category can carry optional per-language names (`names`: language -> name; Worker column `categories.names`, local migration `0002_category_names`, edited in the category form). `useCategories` resolves what each viewer sees: their own translation, else the default-category translation (`suggestedCategories.*`, matched in any language), else the stored `name`; `baseName` keeps the stored one for the form.
- Machine-assisted translations: have a native speaker review `fr`, `de`, `pt`, `it`, `ca` before launching in those markets.

### Adding a language

1. Add an entry to `LOCALES` in `src/i18n/locales.ts` (e.g. `{ code: 'nl', label: 'Nederlands', intlLocale: 'nl-NL', dir: 'ltr' }`).
2. Create `src/i18n/nl.ts` exporting `nl: DeepPartial<Messages>` (copy `fr.ts` as a template; keep `{{placeholders}}` untouched; plural keys need `_one` and `_other`, plus `_few`/`_many`/`_zero`/`_two` if the language uses them).
3. Register it in `dictionaries` in `src/i18n/translate.ts`.
4. Run `pnpm test`: it checks that the new file has every key of `es.ts`, no extra keys, and matching placeholders. The language picker in Settings picks it up automatically.

## Security model

Authorization is enforced **only by the Worker** — the client code is not a boundary.

- **Default deny**; every route except sign-in/sign-up/password reset needs a Better Auth session (bearer token). Every body is validated with zod and the database repeats the key limits as CHECK constraints.
- **Houses:** only ACTIVE members read; only ACTIVE ADMIN members update, delete and write categories, bills, payments and invites. Roles are immutable, an admin cannot be removed, roommates can only leave themselves.
- **Joining** is only possible through a valid invite code (not expired, `usedCount < maxUses`), which creates the ROOMMATE membership.
- **Files** live in a private R2 bucket and are served through short-lived signed same-origin URLs, after the same membership checks. Identity documents are owner-only; avatars are owner-write.
- **Hosting** sends a strict CSP, `X-Frame-Options: DENY`, `nosniff`, HSTS, Referrer-Policy and Permissions-Policy (`public/_headers`, served by the `costos-piso` Cloudflare Worker's static assets).
- CORS allows only the hosted web origins listed in `worker/src/config.ts`, with credentials, so that list must stay explicit.
- Account deletion removes identity documents, makes the user leave roommate memberships and anonymises their member copies. Houses where the user is the ADMIN are left untouched (delete or hand over the house first).

## Assumptions and known gaps

- Nothing has been exercised on a device/simulator yet. Verified: typecheck, lint, unit tests, `expo export --platform web`, the Worker tests against Postgres and the Playwright smoke tests.
- Unique category names per house are not enforced server-side.
- Category reorder uses arrows (no drag library). The expenses list has no sticky month headers. CSV export covers the last 12 months.
- A removed member cannot redeem a new invite; an admin must reactivate them.
- OCR is not implemented: `ocrStatus` stays `NONE`; see `src/features/ocr/README.md`.

## Roadmap

OCR pipeline, push notifications for upcoming charges, per-user rate limits and quotas on the Worker, multi-currency, custom-percentage splits, receipts per payment.
