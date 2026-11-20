# Cutover plan: Firebase to Neon + Cloudflare (issue #7)

Written 2026-11-14. The Worker, the schema, the app's API/auth layer and the migration script exist and were rehearsed on the Firebase
emulators. A dry run against the real project is clean: 7 users (all email + password, all with exported hashes), 3 houses, 393 bills,
111 payments, 352 files. This document is the last mile: how to switch everyone over without losing data.

## The one rule

**Firestore and Storage must stop accepting writes before the final migration starts, and stay read-only afterwards.**
Any write that reaches Firebase after the final copy is lost. Old app builds have no kill switch: the only lever is the security rules.

## Blockers

| # | What | Status |
|---|------|--------|
| 1 | **CORS on the Worker.** The hosted web app calls the Worker from another origin; without CORS headers every browser request is blocked (native apps are unaffected). | **Done in code, not deployed yet.** `costos-piso.web.app` and `costos-piso.firebaseapp.com` are allowed (`localhost:8081` only when the Worker itself runs locally), `set-auth-token` is exposed so the browser can read the session token, 4 tests. Deploy with `pnpm deploy` in `worker/`. |
| 2 | **Web CSP.** `connect-src`, `img-src` and `frame-src` (PDF preview iframe) must include the Worker. | **Done in `public/_headers`**, takes effect with the next `pnpm deploy:web`. |
| 3 | **A new native build.** The new login uses `expo-secure-store`, a native module. `runtimeVersion` policy is `appVersion`, so an OTA update on 1.0.0 would reach installed 1.0.0 binaries that do not contain it and crash them. | **Prepared, no build made.** `version` is 1.1.0 in `app.json` and `package.json`, so over-the-air updates for 1.1.0 can never reach a 1.0.0 binary. What remains is yours to trigger: `eas build --profile preview` for a test build, later `--profile production` + submit. Old 1.0.0 apps keep talking to Firebase and stop working at cutover (see "Old app versions"). |
| 4 | **Read-only rules, and a deploy that cannot re-open writes.** | **Done.** `pnpm rules:readonly` derives frozen rules from the real ones (read access kept, every write removed) into `.readonly/` + `firebase.readonly.json`; `pnpm test:rules:readonly` proves in the emulators that members still read and nothing can be written. `pnpm deploy:web` now deploys hosting only (`--rules` opts back in, only while Firebase is still the live backend). |
| 5 | **`EXPO_PUBLIC_API_URL` in the builds.** It is inlined at bundle time. | **Prepared for builds, left to you for the rest.** The `preview` and `production` profiles in `eas.json` set `EXPO_PUBLIC_API_URL` to the Worker (the `development` profile stays on Firebase / emulators). `.env.example` documents it. **Not changed on purpose: your local `.env`**, since adding the URL there would point your everyday dev server and `pnpm deploy:web` at the live backend. `pnpm deploy:web` and `pnpm deploy:mobile` read `.env`, so set `EXPO_PUBLIC_API_URL` there only at the moment you export the web build / publish an OTA for the cutover. |

Also decide before cutover: **when users who only ever signed in with a Firebase password finish migrating.** Their hash stays in Firebase
format until their first sign-in; keep the `FIREBASE_SCRYPT_*` secrets until everyone active has signed in once.

## Preparation (days before, no user impact)

1. Clear blockers 3 and 5. Deploy the Worker with the CORS change (`cd worker && pnpm deploy`) and run the live smoke test.
2. Build 1.1.0 (preview channel / TestFlight) and test it against the **current Neon data** (the trial migration already loaded it):
   sign in with your own Firebase password (this proves the hash secrets), browse houses and bills, open a PDF, add and delete an expense,
   change password, delete a throwaway account. Test the web build locally against the Worker (`EXPO_PUBLIC_API_URL=… pnpm web`).
3. Optional, recommended: publish one last OTA on 1.0.0 (`pnpm deploy:mobile --production`) with a notice "this version stops working on
   <date>, update the app", so old installs say why they break. It needs a small code change (banner) on the 1.0.0 branch.
4. Tell the 7 users the window (date, ~30 minutes) and that they must update the app. With 3 houses this can be a message.
5. Take a safety copy of Firebase: Firestore export (`gcloud firestore export gs://<bucket>/backup-YYYYMMDD`) and keep the Auth export
   (`firebase auth:export users.json --project costos-piso`, **contains password hashes: keep it private, never commit**).

## Cutover (about 30 minutes)

Run from `worker/`. `GOOGLE_CLOUD_QUOTA_PROJECT=costos-piso` is needed with personal credentials.

| Step | Command / action | Check |
|------|------------------|-------|
| 1. Freeze Firebase | `pnpm rules:readonly && pnpm exec firebase deploy --only firestore:rules,storage --config firebase.readonly.json` | A write from an old app now fails (`permission-denied`). Reads still work. |
| 2. Reset the trial data in Neon | `psql "$DATABASE_URL" -c 'truncate "user", houses, verification cascade'`, then delete `scripts/migrate/.files-remote-*.json` | Row counts 0. R2 does not need wiping: the same keys are overwritten. |
| 3. Dry run | `pnpm migrate:firebase` | Same counts as the last dry run, 0 skips. Stop if anything new appears. |
| 4. Final copy | `pnpm migrate:firebase --database-url "$DATABASE_URL" --r2 remote --apply --verify` | Counts match, sampled R2 files match. Takes a few minutes (files are the slow part). |
| 5. Prove it | Sign in on the new build with your own password; open a bill with a PDF | Sign-in works and the Firebase hash was upgraded. |
| 6. Open the new clients | `pnpm deploy:web` (hosting only; never add `--rules` from here on); submit/release the 1.1.0 build | Web loads, sign-in works from the browser (CORS). |
| 7. Announce | "Ready, please update the app" | |

**Go / no-go is at step 5.** Until step 6 nothing new has been written anywhere that matters, so rollback is just `pnpm exec firebase deploy --only
firestore:rules,storage` with the normal rules (`firebase.json`).

## Rollback

- **Before any user writes to the new backend (steps 1 to 5):** redeploy the normal rules; Firebase is exactly as it was. Nothing lost.
- **After users have written to Postgres:** going back would lose those writes (there is no reverse migration). From here the plan is
  forward only: fix the Worker, redeploy (`pnpm deploy`), Neon keeps data. Keep the window short so this decision is rare.

## Old app versions

Installed 1.0.0 builds talk to Firebase. After step 1 their writes are rejected and after the freeze their data is stale. They need the
update. There is no remote kill switch today; the optional OTA notice in Preparation 3 is the cheapest way to tell them. If a user ignores
the update, nothing is lost: their account and data are already in the new backend.

## After cutover

- Keep Firebase read-only for a few days as a fallback, then take a final Firestore + Storage export and shut the project down
  (issue #7 §9). Keep the Auth export private or delete it.
- Neon backups: check what point-in-time restore the plan includes; if it is short, add the periodic export (Worker cron or GitHub Action to R2) from issue #7 §11.
- Remove the `FIREBASE_SCRYPT_*` secrets once everyone has signed in once (a user who has not still has a Firebase hash; they can use password reset once email sending exists).
- Set up email sending (Resend + a domain) so password reset works; today it is built but dormant.
- Later: Google / Apple sign-in on Better Auth (nobody uses them today), App Check replacement (rate limiting), storage quotas, removing the Firebase SDK from the app.

## Risks and open questions

- **CORS and CSP are the likeliest day-one failures** (web only). Test the web build against the Worker before cutover, not during.
- **Worker CPU on the free plan:** first sign-in of a migrated user runs two scrypt hashes (Firebase verify + Better Auth hash). If sign-ins fail with CPU-limit errors, move the Worker to the paid plan or lower the cost.
- **Only 1 of 7 users has a verified email.** Irrelevant for sign-in today; matters when password reset by email is turned on.
- **Is the app already in the stores or only in TestFlight?** It decides how the 1.1.0 rollout and the "old versions" notice work.
- **Downtime tolerance:** this plan assumes a short announced window is fine. A zero-downtime dual-write migration is possible but far more work for 7 users.
