# T0 spike: SQLite on web

## Verdict: YES

`expo-sqlite@~57.0.5` (wa-sqlite WASM) runs in the `pnpm web:export` bundle. Verified for real with headless
Chrome (CDP), serving `dist` with the headers from `firebase.json` (plus the diff below): open DB, create tables,
insert text and a BLOB, read back, then **fully restart the browser on the same profile and read the rows again**
(`before=1 after=2`, blob bytes intact). Persistence is OPFS (`AccessHandlePoolVFS`) inside a worker.

## The surprise: COOP/COEP is NOT needed if web uses the async API only

`SharedArrayBuffer` (and therefore cross-origin isolation) is only used by the **sync** methods
(`*Sync`, via `invokeWorkerSync` in `expo-sqlite/web/WorkerChannel.ts`). The async methods
(`openDatabaseAsync`, `execAsync`, `runAsync`, `getAllAsync`, `getFirstAsync`, `withTransactionAsync`)
use plain `postMessage`. Test with `crossOriginIsolated === false` passed, including reload persistence.

So: **do not add COOP/COEP headers.** Rule for T2/T12: the web adapter (and the `SqlDb` port) must be
async-only; never call a `*Sync` method.

Why this matters: isolation would need `Cross-Origin-Opener-Policy: same-origin`, which breaks the current web
Google/Apple sign-in (`signInWithPopup` in `src/features/auth/social.ts`; the popup loses `window.opener`; the
current `same-origin-allow-popups` is exactly what keeps it working but does not isolate). COEP would also block
Firebase Auth's cross-origin iframe (`costos-piso.firebaseapp.com`, `accounts.google.com`, reCAPTCHA) and the
Worker/R2/`googleusercontent` images unless they send CORP. All of that is avoided. If sync APIs are ever
needed, host a separate site (own origin) with COOP `same-origin` + COEP `credentialless`; do not change this one.

## Exact diff

`package.json`: `"expo-sqlite": "~57.0.5"` (+ `pnpm-lock.yaml`). Native code: new store build, not OTA.

`metro.config.js` (new file; the repo had none). Without it the export fails with
`Unable to resolve module ./wa-sqlite/wa-sqlite.wasm`:

```js
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
// expo-sqlite on web loads wa-sqlite.wasm as an asset.
config.resolver.assetExts.push('wasm');
module.exports = config;
```

`firebase.json`, CSP header only (two edits to the existing string):

```diff
- script-src 'self' 'sha256-67fh...'
+ script-src 'self' 'wasm-unsafe-eval' 'sha256-67fh...'
...
- object-src 'none'
+ worker-src 'self' blob:; object-src 'none'
```

Both are required, found by failing runs: (1) without `wasm-unsafe-eval` WASM compile is blocked
("violates ... 'unsafe-eval' is not an allowed source"); (2) expo-sqlite creates its worker from a `blob:` URL
and `worker-src` falls back to `script-src`, so it is blocked. `wasm-unsafe-eval` allows WASM only, not JS `eval`.
COOP stays `same-origin-allow-popups`. No other header changes. The `.wasm` is emitted to
`dist/assets/...wasm` and served with a hashed name; Firebase Hosting sets `application/wasm` for `.wasm`
(my static server did; not checked against live Hosting, so confirm on the first preview-channel deploy).

## Web file store: blobs in a SQLite table

Chosen: a `blobs(path, mime_type, data BLOB)` table in the same database (as already sketched in T2).
Reasons: one store, one backup/export path (T11 can serialize everything from one DB), transactional with the
bill row (no orphaned files), and BLOB round-trip was verified. Cost: files up to the app's limit (check
`validateFile` max size) live in the OPFS database file; reading a bill file loads the whole BLOB into memory,
fine for photo/PDF sizes. `getUrl` on web = `URL.createObjectURL(new Blob([data], {type}))` (CSP `img-src`
already allows `blob:`; `frame-src` does NOT, so an in-app PDF iframe preview of a blob URL would need
`blob:` added to `frame-src`, or open in a new tab). Revoke object URLs when done.
OPFS/IndexedDB files were rejected: second store, second backup path, no transactions with SQL.

## Caveats

- **Eviction:** OPFS is ordinary origin storage. Browsers may evict it (Safari ITP: 7 days without interaction
  for non-installed sites; low-disk eviction elsewhere; "clear site data" wipes it). Call
  `navigator.storage.persist()` once local mode is chosen (Chrome grants by heuristic, Firefox prompts,
  Safari 17+ only for installed PWAs / grants quietly). Show a web-specific warning and lean on T11 export + T16 reminder.
  `persist()` returned a value without prompting in headless Chrome; its grant was not verified.
- **Browser support:** needs OPFS `createSyncAccessHandle` in workers (Chrome/Edge 102+, Safari 15.2+, Firefox 111+).
  Private/incognito windows: OPFS may be unavailable or ephemeral, so detect init failure and show a message.
- **Multi-tab:** `AccessHandlePoolVFS` holds exclusive file handles; a second tab opening the same DB will fail
  or wait. Handle the error (message: "close the other tab") in T12.
- **Entry gate for tests/CI:** `better-sqlite3` for Jest per T2; the wasm path is only exercised in a browser.
  Manual QA row in T15: create -> reload -> data present.
- Not verified: Safari/Firefox, live Firebase Hosting headers, sign-in popups under the new CSP (the change only
  adds directives, so existing loads are unaffected by reading; `worker-src` previously fell back to `script-src 'self'`
  and nothing else in the app creates workers, as far as grep shows).
- Dev note: `expo start --web` has no CSP, so it works in dev regardless.
