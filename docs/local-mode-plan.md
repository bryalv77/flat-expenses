# Local mode (issue #8): execution plan

Source design: GitHub issue #8. This file is the **task tracker**. Tick a box only when the task's
Definition of Done is met and merged to the integration branch `feat/local-mode`.

## Decisions (confirmed with the owner)

| Topic | Decision |
|---|---|
| Tracking | This file only (no GitHub sub-issues) |
| Platforms | iOS, Android **and web** in v1 |
| Order vs #7 | #7 has landed (`httpApi`, `ApiAuthProvider`, `AuthContext`). Keep Firebase Auth, add local as a third backend |
| SQL layer | Hand-written SQL, no ORM (the issue's recommendation) |
| Mode switch | Cloud and local are mutually exclusive; switching never mixes data |
| Branching | Integration branch `feat/local-mode`; agents branch from it, the lead merges per wave, one PR to `master` at the end |
| Export reminder | In v1 (task T16) |
| OS backup | Local data is **excluded** from iCloud/Google backup (task T8 native, T14 config), so the in-app export is the only safety net |
| Houses | Multiple houses in local mode, same model as cloud |

## What changed since the issue was written

The issue's "current state" is partly stale. Do not redo what exists:

- `src/lib/db.ts` already selects the backend: `export const api: typeof firestoreApi = USE_API ? httpApi : firestoreApi`.
  So there is no `db.ts` to `api/cloud.ts` move to plan. T1 only extracts the `Api` type and adds the third choice.
- `src/features/auth/AuthContext.ts` already defines `AuthContextValue` with `FirebaseAuthProvider` and
  `ApiAuthProvider` behind it. This is the `AuthContract` the issue asks for; `LocalAuthProvider` implements it.
- `src/lib/storage.ts` branches on `USE_API` per function (`uploadFile`, `getFileUrl`, `deleteFile`, `deleteFolder`).
  T1 turns that into a `FileStore` interface.
- `src/lib/apiHttp.e2e.test.ts` already exercises `httpApi` against the Worker. It becomes the cloud runner of the contract suite (T3).
- `expo-sqlite` is **not** installed. It is native code, so this ships in a new store build, never OTA.

## Working rules for every agent

1. **TDD, strictly.** Commit order inside a task: (a) failing tests, (b) minimal code to pass, (c) refactor. The
   red commit must exist in the branch history. No production code without a failing test first.
2. **Own your files.** Each task lists the files it owns. Touch nothing else. If you need a change elsewhere, stop and
   report to the lead; do not edit it yourself.
3. **One git worktree per agent**, branch `feat/local-mode/<task-id>`, based on `feat/local-mode`. Rebase before handing back.
4. **Before reporting done:** `pnpm typecheck && pnpm lint && pnpm test` green, plus the task's own acceptance test.
5. Reuse, do not rewrite: Zod schemas, `storagePaths`, `sanitizeFileName`, `prepareFile`, `validateFile`, `newId`, finance/reports/schedule logic.
6. Money is integer cents. Dates are ISO text. Booleans are `0/1`. Ids are client-side UUIDs.
7. Report back with: files changed, tests added, anything skipped, anything that surprised you.

## Wave map (what runs in parallel)

```
Wave 0   T0 spike (web SQLite + headers)  ||  T1 interfaces + mode selector
Wave 1   T2 SqlDb + migrations            ||  T3 contract suite (red)          [after T1]
Wave 2   T4 houses/members  || T5 categories || T6 bills+files || T7 payments  [after T2,T3]
         T8 FileStore local (native+web)  ||  T9 LocalAuth + guards + welcome  [after T1, T0 for web]
Wave 3   T10 UI hides  ||  T11 backup export/import  ||  T12 web wiring       [after T4-T9]
Wave 4   T13 i18n + copy ||  T14 release prep  ||  T16 export reminder        [after Wave 3; T16 needs T11]
Wave 5   T15 integration review + manual QA matrix                             [after all]
```

Critical path: T1 → T2 → T4 → T6 → T10/T11 → T15. T0 gates the web half of T8 and T12.

---

## Wave 0

### [ ] T0 Spike: SQLite on web
- **Agent:** `general-purpose`, read-mostly, writes only `docs/local-mode-spike.md`.
- **Question to answer:** can `expo-sqlite` (WASM) run in the web export behind Firebase Hosting, and how do files (bills, avatars) persist on web?
- **Do:** try the `expo-sqlite` web setup in a scratch branch. Needed: COOP/COEP headers in `firebase.json`, Metro wasm config, and the existing web CSP (added in #7) allowing `wasm-unsafe-eval` / workers. Check that COEP does not break current third-party loads (Google/Apple sign-in popups, fonts, R2/Worker fetches, Firebase).
- **Decide in the doc:** web file storage = blobs in a SQLite table (recommended, one store, one backup path) vs OPFS/IndexedDB. State the persistence caveat (browser storage can be evicted; `navigator.storage.persist()`).
- **DoD:** doc with a yes/no, the exact header + config diff, and the chosen file store. If the answer is "no", the lead re-plans web (hide the button, as the issue proposed).

### [ ] T1 Interfaces and mode selector
- **Owns:** `src/lib/api/types.ts`, `src/lib/api/index.ts`, `src/lib/fileStore.ts`, edits to `src/lib/db.ts` and `src/lib/storage.ts`, `src/lib/appMode.ts` (+ tests).
- **Tests first:**
  - `appMode`: default `cloud`; set/get `local`; survives re-read; storage failure falls back to `cloud`.
  - Selector: mode `local` returns `localApi`, otherwise the current `USE_API ? httpApi : firestoreApi`.
  - Type-level: `const _a: Api = httpApi; const _b: Api = firestoreApi` compiles.
- **Do:**
  - `export type Api = typeof firestoreApi` in `types.ts`.
  - `FileStore` = `upload`, `getUrl`, `delete`, `deleteFolder`, with a cloud implementation wrapping today's `storage.ts` branches and a local slot.
  - `appMode: 'local' | 'cloud'` persisted in the storage dependency the app already uses (verify which one; add none).
  - `localApi` and the local `FileStore` are stubs that throw `NotImplemented` until T4-T8.
- **DoD:** zero behaviour change in cloud mode; existing tests and the typecheck are green; the `Api` type is what T3/T4-T7 implement.
- **Risk:** the selector must resolve once at startup. Mode changes go through a reset (T9), not a live swap.

## Wave 1

### [ ] T2 SQLite driver port, migration runner, schema
- **Owns:** `src/lib/api/local/sql.ts` (the `SqlDb` port), `sql.expo.ts` (expo-sqlite adapter), `sql.web.ts` if T0 needs it, `migrate.ts`, `migrations/0001_init.sql`, tests, `devDependencies: better-sqlite3`.
- **Why a port:** Jest runs in Node and cannot load `expo-sqlite`. Tests inject `better-sqlite3` `:memory:` through the same `SqlDb` interface (`all`, `get`, `run`, `transaction`).
- **Tests first:**
  - Fresh DB runs all migrations; `PRAGMA user_version` equals the number of scripts.
  - Re-running is a no-op; a failing script rolls back and leaves `user_version` unchanged.
  - `foreign_keys` is ON (deleting a house cascades to categories, bills, files, payments, members).
  - CHECK constraints reject: bill amount 0 or 10,000,000; notes over 1000 chars; member `ACTIVE` with `removed_at`; `REMOVED` without it; unknown role/status.
  - `effective_date` generated column = `coalesce(charge_date, period_end_date, substr(created_at,1,10))`.
- **Do:** schema from issue §5, minus `invites` and `user_documents`. Add `bill_files` and a `blobs(path, mime_type, data)` table for web (only used if T0 picks it).
- **DoD:** migrations are append-only and tested; the same SQL file runs on native and web.
- **Risk:** `better-sqlite3` needs a native build; add it to `pnpm.onlyBuiltDependencies` and mention it for CI.

### [ ] T3 Shared contract test suite (written red)
- **Owns:** `src/lib/api/contract/` (`harness.ts`, `houses.contract.ts`, `categories.contract.ts`, `bills.contract.ts`, `payments.contract.ts`), `src/lib/api/local/localApi.contract.test.ts`, small edit to `apiHttp.e2e.test.ts` to call the same suites.
- **Tests are the deliverable.** Each suite is `export function run<Domain>Contract(make: () => Promise<{ api: Api; cleanup(): Promise<void> }>)`.
- **Cover, per method of `Api` (about 37):** happy path, validation limits (amount 1..9,999,999, notes ≤ 1000, ≤ 5 attachments, enums), and the invariants that `firestore.rules` enforced:
  - house creation yields house + ADMIN member + seeded suggested categories;
  - a house keeps its admin, and an ADMIN cannot be removed;
  - `removeMember` sets `removedAt`; reactivate clears it;
  - bill/house delete cascades, and `listBills` filters on `effective_date` ordered desc with `MAX_LIST`;
  - payments by month range.
- **DoD:** the suites compile against `Api`; the local runner is red with `NotImplemented`; the cloud runner is unchanged and still green (it is the reference for the expected behaviour: when local and cloud disagree, read `firestore.rules` / the Worker before deciding who is wrong).
- **Note for T4-T7:** you turn your domain's contract green; you do not edit the contract. Disagreement goes to the lead.

## Wave 2

Run T4, T5, T6, T7 in parallel. Each owns one file under `src/lib/api/local/` plus its unit tests; `local/index.ts` (owned by T4) composes them, so T5-T7 only export a `make<Domain>Api(db: SqlDb, ctx)` function.

### [ ] T4 `localApi`: user, houses, members (and the composition root)
- **Owns:** `local/index.ts`, `local/houses.ts`, `local/members.ts`, `local/user.ts`.
- **Do:** fixed `local` user (ADMIN); create house in one transaction (house + ADMIN member + category seed through `seedSuggestedCategories` logic); guest members (`createGuestMember`, `guest_<…>` ids as in the cloud); remove/reactivate; no invites, no `leaveHouse`.
- **DoD:** `houses` contract green on `localApi`.

### [ ] T5 `localApi`: categories
- **Owns:** `local/categories.ts`. **DoD:** `categories` contract green (create, update, deactivate, sort order, `amount_type` rules, recurrence fields).

### [ ] T6 `localApi`: bills and attachments
- **Owns:** `local/bills.ts`. **Depends on** the `FileStore` interface only (use a fake in unit tests).
- **Do:** create/update/delete bill with `bill_files` rows in one transaction; delete the files **after** commit; orphan sweep function `sweepOrphanFiles()` called at startup; `listBills(from, to, categoryId?)`.
- **DoD:** `bills` contract green, including cascade and "files deleted only after commit" (test with a FileStore that records call order).

### [ ] T7 `localApi`: payments
- **Owns:** `local/payments.ts`. **DoD:** `payments` contract green (record, delete, month-range list, `recorded_by`).

### [ ] T8 Local `FileStore` (native + web)
- **Owns:** `src/lib/fileStore.local.native.ts`, `fileStore.local.web.ts`, tests.
- **Native:** `documentDirectory/files/<same key convention>`; `getUrl` returns the `file://` URI; `deleteFolder` removes the prefix. Reuses `storagePaths`/`sanitizeFileName`.
- **Web:** the store chosen in T0 (blob table by default); `getUrl` returns an object URL and revokes it on cleanup.
- **Tests first:** upload, read back, delete, delete folder, missing file is idempotent, path traversal in names rejected. Native tests mock `expo-file-system`; web tests run against `better-sqlite3` through `SqlDb`.
- **DoD:** the same `FileStore` contract test passes for both implementations.

### [ ] T9 `LocalAuthProvider`, route guards, welcome, reduced onboarding
- **Owns:** `src/features/auth/LocalAuthProvider.tsx`, edits to `app/_layout.tsx`, `app/(app)/_layout.tsx`, the welcome screen and `onboarding/*`.
- **Tests first:**
  - Provider returns `authUser = { uid: 'local' }`, `initializing=false`, `profileReady=true`; `features` all false; the account actions throw or are absent (`signIn`, `signUp`, `resetPassword`, `changePassword`, `deleteAccount`).
  - Guard decision tests (pure function extracted from the layouts): local mode skips auth screens and goes to create-house when there is no house; cloud behaviour is unchanged for each existing state.
  - Entering local mode: sets `appMode`, resets the React tree and clears `queryClient`; leaving it signs out of cloud and clears the token (`tokenStorage`).
- **Do:** "Usar sin cuenta (solo en este dispositivo)" button on `welcome`; first-run data-loss notice (once); onboarding without `role` / `join-house`.
- **DoD:** you can launch in local mode, create a house and reach the tabs; cloud login still works.

## Wave 3

### [ ] T10 Hide what does not apply in local mode
- **Owns:** `src/features/profile/*`, house tab screens, `useFileUrl.ts`, `src/lib/analytics.ts`.
- **Tests first:** component tests with the mode set to local assert that these are absent: password, delete account, documents, invites, sign out, `join-house`. They also assert that **analytics never initialises** in local mode (privacy requirement from the issue).
- **Do:** replace "invite" with "add guest roommate"; `useFileUrl` goes through `FileStore.getUrl`.
- **DoD:** the profile shows only: export, import, delete all data, plus the persistent data-loss notice.

### [ ] T11 Backup export / import
- **Owns:** `src/features/backup/*`.
- **Tests first:** round trip (`export` → empty DB → `import` yields identical rows and files); format has a `schema_version`; import of a newer version is refused with a clear error; a corrupt zip changes nothing (import in one transaction, files staged then moved); the delete-all path removes DB rows **and** files.
- **Do:** `.zip` (JSON + `files/`) via `expo-sharing` and `expo-document-picker` on native; download / file input on web.
- **DoD:** a backup made on one platform imports on the others (check JSON and path conventions, not only unit tests).

### [ ] T12 Web wiring
- **Owns:** `firebase.json` (headers/CSP), `metro.config.js`, web-only adapters from T2/T8.
- **Do:** apply the diff proven in T0. Add `COOP`/`COEP` only for what needs them and re-verify OAuth popups and the Worker/R2 fetches.
- **DoD:** `pnpm web:export` serves locally with the headers and local mode works end to end in a real browser (use the browser tooling, with screenshots); no console errors in cloud mode.

## Wave 4

### [ ] T13 i18n and copy
- **Owns:** `src/i18n/*`. **Tests first:** extend `i18n.test.ts` so every new key exists in all locales. Keys for the welcome button, data-loss notice, export/import/delete, guest roommate, and the new errors.

### [ ] T16 Periodic export reminder
- **Owns:** `src/features/backup/reminder.ts` (+ tests), a banner in the Profile/Home screen. Runs after T11.
- **Tests first:** pure function `shouldRemind({ lastExportAt, billsSinceExport, now, mode })`: never in cloud mode; reminds after 30 days or 20 new bills since the last export, whichever is first; snoozing for 7 days works; a fresh export resets both counters. Thresholds are constants, easy to change.
- **Do:** store `lastExportAt` and the snooze date in AsyncStorage; T11 sets `lastExportAt` on a successful export. In-app banner only (no push notifications in v1).
- **DoD:** the banner appears and disappears as the tests say.

### [ ] T14 Release prep
- **Owns:** `app.json`, `eas.json`, `package.json` (version), `README.md`, `docs/`.
- **Do:** exclude the local database and `files/` from OS backup: Android `android:allowBackup="false"` or a `dataExtractionRules` entry (set via the Expo config / a config plugin), iOS `isExcludedFromBackup` on the SQLite and `files/` directories (set at first run in native code through `expo-file-system`, or a config plugin if that API is missing). Verify on a device. Add `expo-sqlite`; bump `runtimeVersion` (new native module = no OTA; see the 1.1.0 prep in #7 for the pattern); add a `test:local` script; CI runs typecheck, lint, Jest (including the local contract) and the Worker e2e.
- **DoD:** `eas build` dry run succeeds for iOS and Android; the README explains the two modes.

## Wave 5

### [ ] T15 Integration review and QA
- **Agent:** a fresh reviewer that did not write the code (`/code-review` at `high`, plus the security-review skill on the backup importer).
- **Manual matrix** (iOS, Android, web × fresh install, cloud user, switch cloud→local, local→cloud): create house, add category, bill with a photo and a PDF, delete bill, record payment, reports, CSV export, backup export, wipe, import.
- **DoD:** no open P0/P1; the issue's open questions answered in the README (iCloud/Google backup choice, one house vs many, periodic export reminder: decide or defer, in writing).

---

## Coordination protocol (how I run the agents)

- The lead (main session) is the only one who edits this file. Agents report; the lead ticks the box, records the commit, and starts whatever the dependency map unblocks.
- Launch each wave's agents in **one message** so they run concurrently, each with `isolation: "worktree"`. A brief per agent = its task section above + the rules + the file ownership list.
- Merge order inside a wave follows the critical path; the lead merges, runs the full suite on `feat/local-mode`, and only then starts the next wave.
- If two agents need the same file, the lead splits the task, not the file.

## Open items

- [ ] Web file storage choice (answered by T0).

Resolved: `appMode` uses `@react-native-async-storage/async-storage` (already a dependency; used by `uiStore.ts`).
