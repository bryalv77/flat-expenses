# Cuota

Shared household costs for roommates. One Expo (React Native) codebase for iOS, Android and Web, backed by Firebase Auth, **Cloud Firestore** and Cloud Storage.

Roles: **admin** (creates the flat, categories, bills, invites, payments) and **roommie** (joins by code, read-only). Currency EUR, stored as integer cents. UI in Spanish (default), English, French, German, Portuguese, Italian and Catalan (see Internationalisation).

## Architecture

- `app/` — Expo Router routes: `(auth)`, `onboarding`, `(app)/(tabs)` (home, expenses, reports, house, profile), bills, categories, members, payments, profile, settings.
- `src/components/ui`, `src/components/charts` — iOS-style design system and SVG charts; `src/theme` — tokens and `useTheme()`.
- `src/features/*` — feature hooks (TanStack Query) plus pure, unit-tested logic: `schedule`, `finance`, `reports`.
- `src/lib` — Firebase init (`firebase.ts`), Firestore data layer (`db.ts`, the `api` object), storage helpers, formatting, UI store (Zustand).
- `firestore.rules`, `storage.rules`, `firestore.indexes.json`, `firebase.json` — backend config. `docs/firestore-model.md` documents the collections; `docs/*-api.md` list module APIs.
- `scripts/seed-demo.mjs` — demo data (users, houses, 12 months of bills with PDF invoices, payments).
- `tests/rules/` — security-rules tests (run in the emulators).

## Run

```bash
pnpm install
cp .env.example .env
pnpm expo start            # i / a / w for iOS, Android, web
pnpm typecheck && pnpm lint && pnpm test
```

Emulators (`EXPO_PUBLIC_USE_EMULATORS=true` in `.env`; needs JDK 21+): `firebase emulators:start`.

Security-rules tests (starts Firestore + Storage emulators, JDK 21+ required): `ppnpm test:rules`.

## Deploy

```bash
firebase login
firebase deploy --only firestore,storage      # creates the (default) Firestore database in eur3 on first deploy + rules + indexes
pnpm deploy:web                            # export web + deploy to Cloudflare Pages (costos-piso.pages.dev; checks the CSP hash in public/_headers first; needs `wrangler login`)
pnpm deploy:mobile ["message"] [--production]   # EAS Update (OTA): preview channel by default
```

Storage rules read Firestore, so the first Storage deploy asks to grant the *Firebase Rules Firestore Service Agent* role — accept it. Enable Email/Password (and optionally Google/Apple) in the Auth console. Native Google/Apple sign-in needs OAuth client ids and an EAS build; email/password works out of the box.

Demo data: `node scripts/seed-demo.mjs` (add `--emulator` for local emulators). It prints the demo passwords once and stores them in `scripts/.demo-credentials*.json` (gitignored). **Delete the demo accounts before a real launch** (Auth console), or change their passwords.

## Mobile builds

`pnpm dlx eas-cli build -p ios` / `-p android` (iOS bundle id `com.devalv.costospiso`, Android package `com.costospiso.app`).

## Cloud vs local mode

- **Cloud**: accounts, shared houses and roles, backed by Firebase / the Worker API (Neon + R2). Data lives on the server.
- **Local**: one device, no account, no network. Houses, bills and payments live in a SQLite database (`expo-sqlite`; WASM on web, where files are stored as blobs in the same DB). Bill photos/PDFs and avatars are files under `Documents/files` on native.
- **Startup is local-first**: a fresh install opens straight into local mode (no login prompt), and a returning cloud account is restored only when a session token is already present. "Log in / Create account" lives in the Profile tab; when a user logs in after using local mode, a sync screen uploads their local houses to the account (additive, per house) or discards the local copy in favour of the cloud data.
- **Backup**: local data is deliberately excluded from OS backup, so the in-app backup export (and CSV export) is the only safety net. iOS: `Documents/SQLite` and `Documents/files` are marked `isExcludedFromBackup` at launch by `plugins/withExcludeLocalDataFromBackup.js`. Android: `android.allowBackup=false` in `app.json` (all-or-nothing: it also drops Android Auto Backup for other app data; SecureStore is not backed up anyway). On web, browser storage can be evicted; export regularly.
- Adding `expo-sqlite` is a native change: it ships in a new store build (version 1.2.0, `runtimeVersion` follows `appVersion`), never via OTA.
- Dev: `pnpm test` (unit, cloud contract skipped), `pnpm test:local` (contract suite against local SQLite via `better-sqlite3`; install with `--ignore-scripts` is fine, prebuilt binaries load), `pnpm typecheck`, `pnpm lint`. CI (`.github/workflows/ci.yml`) runs all four.

## Internationalisation

Everything lives in `src/i18n/`:

- `locales.ts` — the **registry** (`code`, native `label`, `intlLocale`, `dir`). `Locale` is derived from it, so the registry is the single source of truth.
- `es.ts` — the source messages (defines the `Messages` shape). `en.ts`, `fr.ts`, `de.ts`, `pt.ts`, `it.ts`, `ca.ts` — one file per language.
- `translate.ts` — pure `translate()` / `translatePlural()` (no React, usable from logic and tests). `index.ts` — the `useT()` hook returning `{ t, tp, locale }`.
- Fallback chain for a missing key: the locale → English → Spanish → the key itself (a dev-only `console.warn` reports the miss). A new language can therefore ship incomplete.
- First run: the device language (`expo-localization`) is matched to the registry, falling back to Spanish. An explicit choice in Settings (or the saved profile language) always wins and is persisted.
- Numbers, money and dates use `Intl` with the registry's `intlLocale` (`src/lib/format.ts`); plurals use `Intl.PluralRules` through keys such as `schedule.week_one` / `schedule.week_other` (`tp('schedule.week', n)`).
- Category names are data, not UI strings. A category can carry optional per-language names (`names`: language -> name; Worker column `categories.names`, local migration `0002_category_names`, edited in the category form). `useCategories` resolves what each viewer sees: their own translation, else the default-category translation (`suggestedCategories.*`, matched in any language), else the stored `name`; `baseName` keeps the stored one for the form. The legacy Firestore backend does not store `names`.
- Machine-assisted translations: have a native speaker review `fr`, `de`, `pt`, `it`, `ca` before launching in those markets.

### Adding a language

1. Add an entry to `LOCALES` in `src/i18n/locales.ts` (e.g. `{ code: 'nl', label: 'Nederlands', intlLocale: 'nl-NL', dir: 'ltr' }`).
2. Create `src/i18n/nl.ts` exporting `nl: DeepPartial<Messages>` (copy `fr.ts` as a template; keep `{{placeholders}}` untouched; plural keys need `_one` and `_other`, plus `_few`/`_many`/`_zero`/`_two` if the language uses them).
3. Register it in `dictionaries` in `src/i18n/translate.ts`.
4. Add the code to the `d.locale in [...]` list in `firestore.rules` (the profile `locale` field is validated server-side) and deploy the rules. `pnpm test` fails if the list and the registry disagree.
5. Run `pnpm test`: it checks that the new file has every key of `es.ts`, no extra keys, and matching placeholders. The language picker in Settings picks it up automatically.

## Security model

Authorization is enforced **only by the security rules** — the client code is not a boundary.

- **Default deny**; everything requires sign-in. Every write validates the complete resulting document (exact key set, types, ranges, enums) and server timestamps (`== request.time`).
- **Users** read/write only their own profile. **Identity documents** (metadata and files) are owner-only; house admins cannot read them (rules cannot express "admin of a house the owner belongs to" without Cloud Functions/custom claims — see roadmap).
- **Houses:** only ACTIVE members read; only ACTIVE ADMIN members update, delete and write categories, bills, payments and invites. Membership is `houses/{h}/members/{uid}` (one document read per check).
- **Joining** is only possible through a valid invite, in one batch that creates the member document (role ROOMMATE) and increments `invites/{code}.usedCount` by exactly 1 (status ACTIVE, not expired, `usedCount < maxUses`). Roles are immutable, admins can never be removed, roommates can only leave themselves.
- **Storage** rules check membership through Firestore: bills are readable by active members and writable by active admins only (PDF/image, < 10 MB, path must live under the house); avatars owner-write (< 2 MB); identity documents owner-only. Everything else is denied.
- **Hosting** sends a strict CSP, `X-Frame-Options: DENY`, `nosniff`, HSTS, Referrer-Policy and Permissions-Policy (`public/_headers`, served by Cloudflare Pages).
- The Firebase web config in the repo is public by design. Restrict the API key in Google Cloud Console (HTTP referrers `costos-piso.web.app`, `costos-piso.firebaseapp.com`, `localhost`; limit to Identity Toolkit, Firestore, Storage APIs).
- Account deletion removes identity documents, makes the user leave roommate memberships and anonymises their member copies. Houses where the user is the ADMIN are left untouched (delete or hand over the house first).

## Cost & abuse controls

Target: stay within Firestore/Storage/Hosting free quotas (≤ ~$2/month).

- The client uses **one-shot reads only** (no snapshot listeners), an in-memory Firestore cache, TanStack Query `staleTime` of 5 min and no refetch-on-focus. Lists are bounded (`limit`), bills/payments are fetched by date range through one indexed query. A report screen reads at most the bills of 36 months (a few hundred documents).
- Rough budget: free tier is 50k reads / 20k writes / 20k deletes per day and 1 GiB stored; Storage free tier is 5 GB stored and 1 GB/day download (check the current Firebase pricing page).
- **Rules cannot rate-limit.** A signed-in user could still create documents/files in houses they administer until quotas are hit. Mitigations to configure in the console (not code): **App Check** (reCAPTCHA Enterprise/v3 on web, App Attest/Play Integrity on mobile) with enforcement on Firestore and Storage; a **Cloud Billing budget** with alerts at $1/$2; optionally a Cloud Function that disables billing when the budget is exceeded. Firebase budgets only alert — they do not stop spending by themselves.
- Email enumeration protection and a password policy are available under Auth → Settings.

## Assumptions and known gaps

- Nothing has been exercised on a device/simulator yet. Verified: typecheck, lint, unit tests, `expo export --platform web`, rules tests (emulators) and the seed script against the emulators.
- Unique category names per house are not enforced server-side.
- Category reorder uses arrows (no drag library). The expenses list has no sticky month headers. CSV export covers the last 12 months.
- A removed member cannot redeem a new invite; an admin must reactivate them.
- OCR is not implemented: `ocrStatus` stays `NONE`; see `src/features/ocr/README.md`.

## Roadmap

OCR pipeline, push notifications for upcoming charges, Cloud Functions + custom claims (admin access to identity documents, per-user quotas, billing kill-switch), multi-currency, custom-percentage splits, receipts per payment.
