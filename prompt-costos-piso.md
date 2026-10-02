# MASTER PROMPT — "Costos Piso" (Expo + Firebase Data Connect)

> Paste everything below this line into Claude Code (Sonnet 5.5) in an empty project folder.

---

You are a senior full-stack mobile engineer. Build a complete, production-quality cross-platform app called **Costos Piso** in a single pass: iOS, Android and Web from one Expo (React Native) codebase, with an iOS-native look and feel, full dark mode, and a Firebase backend that uses **Firebase Data Connect (Cloud SQL for PostgreSQL)**. Do not ask me questions; make sensible decisions, document assumptions in `README.md`, and finish the whole thing. Work in this order: plan → scaffold → Data Connect schema & operations → services layer → UI → rules/config → README. When done, run type-checking and fix every error.

## 1. Product summary

An app to manage shared household costs for roommates living in a flat (piso). Two roles:

- **House admin** ("admin de piso"): creates a house, invites/removes roommates with a code, manages recurring expense categories, uploads bills (PDF or photo), sees every report, chooses the split mode.
- **Roommate** ("roommie"): joins a house with an invite code, sees how much has been spent, sees reports, sees their share. Read-only on bills and categories.

Every user (Firebase Auth) can edit display name, profile photo, and must upload personal identity documents (passport or national ID/DNI) as PDF or image.

Currency is **EUR** (store as integer cents, never floats). UI language: **Spanish by default** with i18n structure (`es`, `en`) so English can be switched in settings. Code, comments and identifiers in English.

## 2. Tech stack (strict)

- **Expo SDK (latest stable)**, **Expo Router** (file-based routing), **TypeScript strict**.
- Targets: iOS, Android, Web. The web build is **exported statically** (`expo export --platform web`, `"web": { "output": "static" }` in `app.json`) and deployed to **Firebase Hosting** (`firebase.json` serving `dist/`, with SPA-style rewrite fallback to `/index.html` for dynamic routes). Add npm scripts: `web:export`, `web:deploy`.
- Firebase **JS SDK (modular, `firebase` package)**, NOT `@react-native-firebase`, so it works in Expo Go and on web. Use:
  - `firebase/auth` with `getReactNativePersistence(AsyncStorage)` on native and `browserLocalPersistence` on web (platform-split in `src/lib/firebase.ts`).
  - `firebase/storage` for files.
  - `firebase/data-connect` through the **generated typed SDK** (`firebase dataconnect:sdk:generate`), with connector config for the `javascript`/web SDK output into `src/dataconnect-generated`. Add `@tanstack/react-query` hooks wrapping the generated operations (the generated react SDK may be used if compatible with Expo; otherwise wrap manually).
- State/data: TanStack Query for server state, Zustand only for tiny UI state (theme, locale, active house id).
- UI libs: `expo-image`, `expo-image-picker`, `expo-document-picker`, `expo-blur`, `expo-haptics`, `expo-symbols` (SF Symbols on iOS) with a fallback to `@expo/vector-icons` (Ionicons) on Android/web via a single `<Icon name=... />` wrapper, `react-native-reanimated`, `react-native-gesture-handler`, `react-native-safe-area-context`, `react-native-svg`, `@react-native-community/datetimepicker` for native date pickers and a web-compatible date input (HTML `<input type="date">` styled to match) behind one `<DatePickerField />` component (iOS: inline/compact picker in a bottom sheet; Android: native dialog; web: styled native date input).
- Charts: `victory-native` (or `react-native-svg`-based custom charts if Victory has Expo/web problems). Charts must work on iOS, Android and Web and respect dark mode.
- Forms: `react-hook-form` + `zod`.
- Dates: `date-fns`.
- No class components, no `any`, no inline styles scattered around: use a central design system (section 6).

## 3. Firebase configuration (use exactly this)

Create `src/lib/firebase.ts` that initializes the app with this config (read values from `EXPO_PUBLIC_FIREBASE_*` env vars in `.env` with these as the committed defaults/example in `.env.example`):

```ts
const firebaseConfig = {
  apiKey: "AIzaSyA7La5uaZjWfCRQYglvVtQ5K8azOWZO-VU",
  authDomain: "costos-piso.firebaseapp.com",
  projectId: "costos-piso",
  storageBucket: "costos-piso.firebasestorage.app",
  messagingSenderId: "292130454121",
  appId: "1:292130454121:web:1fb0edd8bcd5292eb040f8",
  measurementId: "G-8S760DB93E"
};
```

Notes: guard against double initialization (hot reload), only init Analytics on web and only if supported, and connect to the Data Connect and Auth emulators when `EXPO_PUBLIC_USE_EMULATORS=true`.

Also create all Firebase project files:

- `firebase.json` (hosting for `dist`, dataconnect, storage rules, emulators for auth/dataconnect/storage/hosting).
- `.firebaserc` with default project `costos-piso`.
- `dataconnect/dataconnect.yaml`: serviceId `costos-piso`, location `europe-west1` (or the closest supported EU region), Cloud SQL PostgreSQL instance `costos-piso-fdc`, database `costos_piso`, schema source `./schema`, connectors `./default`.
- `dataconnect/default/connector.yaml` with `connectorId: default` and generate config for the JavaScript SDK output to `../src/dataconnect-generated`.
- `storage.rules` (section 5).
- Auth providers to document in README: Email/Password, Google, Apple (Apple is required on iOS if Google is offered). Implement email/password + Google + Apple sign-in; Apple only shown on iOS/web, wired with `expo-apple-authentication` on iOS. If native Google/Apple require native build config, implement them behind feature flags and make email/password fully functional out of the box.

## 4. Database schema (Firebase Data Connect → PostgreSQL)

Write `dataconnect/schema/schema.gql` using Data Connect directives (`@table`, `@col`, `@ref`, `@unique`, `@index`, `@default`). Use `UUID` primary keys with `@default(expr: "uuidV4()")` and `createdAt/updatedAt` timestamps with `@default(expr: "request.time")`. Auth user ids (`auth.uid`) are the primary key of `User`. Money = `Int` cents. Use enums.

Also generate `docs/schema.sql`: the equivalent plain PostgreSQL DDL for reference (tables, enums, FKs, check constraints, indexes).

### Enums
- `HouseRole`: `ADMIN`, `ROOMMATE`
- `SplitMode`: `EQUAL` (everything split equally among active members), `FIXED_CONTRIBUTION` (admin charges each roommate a fixed amount per month)
- `AmountType`: `FIXED` (known amount every cycle, e.g. Netflix 15 €), `VARIABLE` (depends on the bill, e.g. gas, phone, water)
- `IntervalUnit`: `DAY`, `WEEK`, `MONTH`, `YEAR`
- `DocumentType`: `PASSPORT`, `NATIONAL_ID`
- `InviteStatus`: `ACTIVE`, `REVOKED`, `EXPIRED`
- `MemberStatus`: `ACTIVE`, `REMOVED`

### Tables

1. **User** — `id` (= Firebase uid, String PK), `email`, `displayName`, `photoPath` (Storage path, nullable), `accountRole` (`ADMIN` | `ROOMMATE`, chosen at onboarding; informational/default intent), `locale`, `createdAt`, `updatedAt`.
2. **UserDocument** — `id`, `user` → User, `type` DocumentType, `storagePath`, `fileName`, `mimeType`, `sizeBytes`, `uploadedAt`. A user may have several (front/back, multiple files).
3. **House** — `id`, `name`, `address` (nullable), `currency` default `"EUR"`, `splitMode` SplitMode default `EQUAL`, `fixedContributionCents` Int nullable (per roommate per month; required when `splitMode = FIXED_CONTRIBUTION`), `contributionDayOfMonth` Int nullable, `createdBy` → User, timestamps.
4. **HouseMember** — `id`, `house` → House, `user` → User, `role` HouseRole, `status` MemberStatus, `joinedAt`, `removedAt` nullable, `individualContributionCents` Int nullable (optional per-member override of the house fixed contribution). `@unique(fields: ["house","user"])`. Rule: exactly the creator is `ADMIN` initially; a house always has at least one ADMIN.
5. **HouseInvite** — `id`, `house` → House, `code` String `@unique` (8 chars, uppercase, unambiguous alphabet, e.g. `K7QX-M2PD` displayed, stored normalized), `status`, `expiresAt`, `maxUses` Int default 1, `usedCount` Int default 0, `createdBy` → User.
6. **ExpenseCategory** — the dynamic "gasto fijo / recurring expense" definitions per house: `id`, `house` → House, `name`, `icon` (string key from the icon set), `color` (hex), `amountType` AmountType, `expectedAmountCents` Int nullable (required when FIXED; optional estimate when VARIABLE), `intervalUnit` IntervalUnit, `intervalCount` Int ≥ 1 (e.g. Netflix = `WEEK` × 4; rent = `MONTH` × 1; gas = `MONTH` × 2; yearly insurance = `YEAR` × 1; every 10 days = `DAY` × 10), `anchorDate` Date (first/reference charge date used to compute the schedule), `isActive` Boolean, `sortOrder` Int, `notes` nullable, timestamps. Unique `(house, name)`.
7. **Bill** — a real charge/invoice entry: `id`, `house` → House, `category` → ExpenseCategory (**required**), `amountCents` Int (**required**, > 0), `chargeDate` Date nullable (fecha de cobro), `periodEndDate` Date nullable (fecha de corte / billing cut-off), `periodStartDate` Date nullable, `fileStoragePath` nullable, `fileName`, `fileMimeType`, `fileSizeBytes` nullable, `notes` nullable, `ocrStatus` enum (`NONE`, `PENDING`, `DONE`, `FAILED`, default `NONE`), `ocrData` JSON nullable (reserved for the future OCR/automatic extraction — do NOT implement OCR now, but keep the column, the status enum and a clearly marked `TODO(ocr)` extension point in the upload flow), `createdBy` → User, timestamps. Indexes on `(house, chargeDate)`, `(house, category)`.
   - **Reporting date rule** (`effectiveDate`): `chargeDate`, else `periodEndDate`, else `createdAt::date`. Implement it consistently (a SQL view/derived field in the connector and a TS helper `getEffectiveDate(bill)`).
8. **MemberPayment** — tracks what each roommate has actually paid to the admin (needed for FIXED_CONTRIBUTION mode, optional in EQUAL mode): `id`, `house`, `member` → HouseMember, `month` Date (first day of month), `amountCents`, `paidAt`, `note`, `recordedBy` → User. Admin records them manually.

### Operations (Data Connect connector `default`)

Write queries and mutations as `.gql` files in `dataconnect/default/`. Every operation must enforce authorization with `@auth(level: USER)` and server-side checks using `auth.uid` (e.g. `@check`/`@redact` + `_expr: "auth.uid"` patterns): only active members can read a house's data; only house ADMINs can mutate categories, bills, members, invites, payments and house settings; a user can only read/write their own `User` and `UserDocument` rows (plus admins can read documents of **active members of their own house** — make this a clear, documented design decision).

Minimum operations:

- User: `UpsertUser`, `GetMe`, `UpdateMyProfile` (name, photoPath, locale), `ListMyDocuments`, `AddMyDocument`, `DeleteMyDocument`.
- House: `CreateHouse` (also creates the creator's ADMIN HouseMember in the same mutation), `UpdateHouse` (incl. split mode and fixed contribution), `ListMyHouses`, `GetHouse` (with members), `DeleteHouse` (soft safeguard: admin only, requires confirmation in UI).
- Members/invites: `CreateInvite`, `RevokeInvite`, `ListInvites`, `RedeemInvite(code)` (validates status/expiry/maxUses, creates the ROOMMATE HouseMember, increments `usedCount`), `RemoveMember` (sets REMOVED + `removedAt`, never hard-deletes history), `ReactivateMember`, `LeaveHouse` (roommate), `ListMembers`.
- Categories: `CreateCategory`, `UpdateCategory`, `ArchiveCategory`, `ListCategories`, `ReorderCategories`.
- Bills: `CreateBill`, `UpdateBill`, `DeleteBill`, `ListBills(houseId, from, to, categoryId?)`, `GetBill`.
- Payments: `RecordPayment`, `DeletePayment`, `ListPayments(houseId, from, to)`.
- Reports: prefer fetching bills for a date range and computing aggregates **client-side in pure, unit-tested TypeScript functions** (`src/features/reports/calculations.ts`) so the logic works identically everywhere; additionally expose Data Connect native-SQL queries only if they simplify things. Keep the aggregation logic in one place.

Add a `dataconnect/seed.gql` (or a seed script) with sample categories (Alquiler, Luz, Internet, Teléfono, Gas, Limpieza, Agua, Netflix) with icons, colors and schedules matching the examples below, usable for the emulator.

### Seed examples that MUST be representable
- Alquiler: VARIABLE or FIXED, 1200 €, every 1 month.
- Netflix: FIXED, 15 €, every **4 weeks**.
- Internet: FIXED, every 1 month.
- Gas: VARIABLE, every **2 months**, amount comes from the bill.
- Teléfono: VARIABLE (consumption), every 1 month.
- Luz, Agua, Limpieza: any cycle defined by the admin.

## 5. Storage & security

- Storage paths: `users/{uid}/avatar/{filename}`, `users/{uid}/documents/{docId}/{filename}`, `houses/{houseId}/bills/{billId}/{filename}`.
- Allowed types: `image/jpeg`, `image/png`, `image/heic`, `image/webp`, `application/pdf`. Max 15 MB for documents/bills, 5 MB for avatars. Enforce in `storage.rules` **and** client-side (compress images with `expo-image-manipulator` before upload; ask for HEIC → JPEG conversion).
- `storage.rules`: a user can read/write only their own `users/{uid}/**`; avatars are readable by members of the same house; bills readable by active house members and writable only by house admins. Because Storage rules can't query Cloud SQL directly, implement membership checks through **custom claims or a lightweight Firestore-less approach**: use Firebase Auth custom claims is not available without Cloud Functions, so instead choose this pragmatic design and document it in the README: bill files and identity documents are accessed via **short-lived signed/download URLs retrieved only after the Data Connect operation (which enforces membership) returns the path**, and Storage rules restrict writes to the owner (`users/{uid}`) or require `request.auth != null` with unguessable UUID paths for bills (read requires auth). Document the trade-off and list "tighten with Cloud Functions + custom claims" in README as a follow-up.
- Never commit secrets other than the public Firebase web config. Add `.gitignore` entries and `.env.example`.
- Client-side validation with zod on every form; sanitize file names.

## 6. Design system — iOS-native look, dark mode first-class

Create `src/theme/` with tokens and a `useTheme()` hook that follows the system color scheme and allows manual override (System / Light / Dark) stored with AsyncStorage/localStorage.

- Mimic **Apple Human Interface Guidelines**: SF-like typography (use `System` font; on web `-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, system-ui`), large collapsing titles on tab roots, grouped inset lists (`UITableView.insetGrouped` style) with rounded 10–12 px corners, hairline separators, chevrons, swipe actions (delete/archive) with haptics, pull-to-refresh, native-feeling bottom sheets, segmented controls, `UISwitch`-style switches, context-menu-like action sheets, and blur (translucent) tab bar and navigation headers via `expo-blur`.
- Colors — use iOS semantic palette. Light: background `#F2F2F7`, grouped cell `#FFFFFF`, label `#000000`, secondaryLabel `rgba(60,60,67,0.6)`, separator `rgba(60,60,67,0.29)`, tint `#007AFF`. Dark: background `#000000`, elevated grouped `#1C1C1E`, secondary `#2C2C2E`, label `#FFFFFF`, secondaryLabel `rgba(235,235,245,0.6)`, separator `rgba(84,84,88,0.65)`, tint `#0A84FF`. System colors for red/green/orange/etc. with light/dark variants.
- Spacing scale 4/8/12/16/20/24/32, radii 10/12/16/24, subtle spring animations with Reanimated, haptic feedback on key actions (`expo-haptics`, no-op on web).
- Reusable primitives in `src/components/ui/`: `Screen`, `LargeTitleHeader`, `Section`, `ListRow`, `Button` (filled / tinted / plain, loading state), `TextField` (iOS style, inline labels, error text), `Switch`, `SegmentedControl`, `Avatar`, `Badge`, `Card`, `EmptyState`, `BottomSheet`, `ActionSheet`, `Chip`, `ColorPicker` (iOS system color grid), `IconPicker` (grid of ~60 curated icons for utilities, home, food, subscriptions, transport…), `MoneyInput` (EUR, cents-safe, locale formatting `1.200,00 €` for es), `DatePickerField`, `FilePickerField` (image from library/camera or PDF from files; shows preview/thumbnail and file name/size).
- Web: constrain content to a centered max width (~720 px) with a sidebar/tab layout switch on wide screens (≥ 1024 px: left sidebar navigation; mobile/native: bottom tab bar). Keep the iOS aesthetic on web.
- Accessibility: dynamic type friendly, 44 pt touch targets, labels on icon buttons, sufficient contrast in both themes.
- Currency/number/date formatting through `Intl` with the active locale; centralize in `src/lib/format.ts`.

## 7. Screens & flows (Expo Router structure)

```
app/
  _layout.tsx                 # providers: theme, query client, auth gate, i18n
  (auth)/
    welcome.tsx  sign-in.tsx  sign-up.tsx  forgot-password.tsx
  onboarding/
    role.tsx                  # choose: "Soy admin del piso" / "Soy roommie"
    create-house.tsx          # admin
    join-house.tsx            # roommie: enter invite code
  (app)/
    (tabs)/
      index.tsx               # Home / Resumen
      expenses.tsx            # Bills list + filters
      reports.tsx             # Reports
      house.tsx               # House & members (admin tools if ADMIN)
      profile.tsx             # Profile & settings
    bills/new.tsx  bills/[id].tsx  bills/[id]/edit.tsx
    categories/index.tsx  categories/new.tsx  categories/[id].tsx
    members/invite.tsx  members/[id].tsx
    payments/index.tsx
    profile/edit.tsx  profile/documents.tsx
    settings/index.tsx        # theme, language, house switcher, sign out, delete account
```

### Auth & onboarding
1. Welcome → sign up / sign in (email+password, Google, Apple). On first login call `UpsertUser`.
2. If the user has no house: role selection. **Admin** → create house wizard (name, address, split mode, optionally fixed contribution, then seed suggested categories with one tap). **Roommie** → enter invite code (auto-format, paste support, clear error messages) → joins.
3. Persist the active house id; users with multiple houses get a house switcher in Settings.
4. Auth gate redirects correctly on all platforms, handles loading states without flicker.

### Home / Resumen
- Greeting with avatar, active house name.
- Current month total spent, vs previous month (delta % with up/down color), per-person share (EQUAL mode) or fixed contribution status (FIXED mode).
- Donut/bar breakdown by category with each category's icon/color.
- "Próximos cobros": upcoming scheduled charges computed from category schedules (next 30 days) with expected amounts.
- Quick action (admin): "Añadir factura".

### Categories (admin CRUD, everyone can view)
- List with icon, color, amount type, schedule summary in natural language ("Cada 4 semanas · 15,00 €", "Cada 2 meses · variable").
- Create/edit form: name, icon picker, color picker, amount type (Fixed/Variable), expected amount, interval count + unit (Días/Semanas/Meses/Años), anchor date (date picker), active toggle, notes. Swipe to archive; reorder via drag.
- Schedule engine `src/features/schedule/occurrences.ts`: pure functions `getOccurrences(category, from, to)` and `getNextOccurrence(category, today)` handling DAY/WEEK/MONTH/YEAR with correct month-end clamping (e.g. anchor Jan 31 + 1 month → Feb 28/29, then Mar 31 relative to the anchor, not drifting). Include **unit tests** (Jest) covering every unit, month-end, leap years, and the Netflix every-4-weeks case.

### Bills (admin creates, everyone views)
- "Nueva factura" form: **category (required)**, **amount in € (required)**, **charge date (optional)**, **cut-off / period date (optional, can be a period start–end range)**, file (optional but encouraged: PDF or photo via camera/library/files), notes. Show upload progress, handle errors/offline retry, preview of images and PDF (open with `expo-web-browser`/`Linking`; inline `<iframe>`/`<embed>` on web).
- When the chosen category is FIXED, prefill amount from `expectedAmountCents` (editable).
- List grouped by month (sticky month headers with month total), filter chips by category and date range, search by notes, swipe-to-delete for admin with confirmation.
- Bill detail screen with file preview, edit/delete for admin.
- Leave the clearly marked OCR extension point: after upload, set `ocrStatus = 'NONE'` and add a `src/features/ocr/README.md` describing the planned pipeline (Cloud Function triggered on Storage upload → document AI/LLM extraction → fills `ocrData`, suggests category/amount/dates for admin confirmation).

### Members (house tab)
- Admin: member list with avatar, name, role, status, join date; generate invite code (copy, share via native share sheet / `navigator.share`/clipboard on web, QR code with `react-native-qrcode-svg`), set expiry and max uses, revoke codes, remove/reactivate roommates (with confirmation), view a roommate's uploaded identity documents (admin-only, clearly labeled as sensitive).
- Roommate: see housemates, leave house.

### Profile
- Edit display name, change avatar (camera/library, crop square, compress, upload to Storage), email shown read-only, change password (email provider).
- **Identity documents**: add passport/DNI as PDF or image, list with type/status/date, view, replace, delete. Show a persistent but unobtrusive banner on Home until at least one document is uploaded.
- Settings: theme (System/Light/Dark), language (es/en), sign out, delete account (re-authentication required, deletes Storage files and DB rows).

## 8. Split modes & financial logic

Implement in `src/features/finance/` as pure, unit-tested functions.

**Mode A — `EQUAL` (everything split equally):**
- For any month: `totalSpent = Σ bills (by effectiveDate)`; `perPerson = totalSpent / activeMembersCount` using integer cents with deterministic remainder distribution (e.g. largest-remainder, assign leftover cents to members sorted by join date). Use the members active **during that month** (respect `joinedAt`/`removedAt`).
- Show each member's share per month and per category.

**Mode B — `FIXED_CONTRIBUTION`:**
- The admin sets `fixedContributionCents` per roommate per month (optionally overridden per member via `individualContributionCents`).
- Each month the app computes: `expectedIncome = Σ contributions of active roommates`, `totalSpent`, `balance = expectedIncome − totalSpent`, and the **equal-split share** that would have been due (same as Mode A) so the admin can compare "what each one pays" vs "what an equal split would have been". Show status: **sufficient / insufficient / surplus** with color and amount (e.g. "600 € was enough: surplus of 38,40 €" or "Short by 120 €"), plus a cumulative balance across months and a suggestion: "Recommended contribution to break even: X €" (based on the trailing 3–12 month average) and "to keep a Y € margin".
- `MemberPayment` records let the admin mark who has paid each month; show paid/pending per roommate and outstanding totals.
- Roommates in this mode see their own contribution and payment status, and the house-level balance only if the admin enables "show balance to roommates" (add a boolean `showBalanceToRoommates` to `House`, default true).
- The admin can switch the mode at any time; historical reports must still compute both views regardless of the current mode.

## 9. Reports (a first-class feature — make them excellent)

A **Reports** tab with a segmented control and a month/year selector, all with interactive charts and also tabular data:

1. **Monthly overview**: total by month (bar chart, last 12 months), stacked by category; tap a month to drill into its bills.
2. **By category**: pick a category (gas, water, phone, electricity…) → monthly/billing-period series, **average per bill**, **average per month** (normalize multi-month cycles: a bi-monthly gas bill of 80 € counts as 40 €/month for monthly averages — implement an "amortized monthly cost" function based on the category interval), min, max, total, trend line.
3. **Seasonality**: compare summer (Jun–Sep) vs winter (Dec–Feb) vs the yearly average per category — specifically to see the air-conditioning effect on electricity and heating effect on gas/electricity. Show month-of-year averages across years and a year-over-year comparison line chart.
4. **Month lookup**: "How much did we spend on phone in March 2026?" — a quick query UI: pick category (or All) + month + year → instant answer card with the amount, number of bills and the list.
5. **Projection / forecast**: choose a future month (e.g. December) → projected total and per-category breakdown. Method: for FIXED categories use the schedule engine's expected occurrences × expected amount; for VARIABLE categories use (a) the same month last year if available, else (b) the trailing average of the last N bills weighted toward recent data, adjusted by a seasonal factor when ≥ 12 months of data exist. Display confidence ("Basado en 14 meses de datos" / "Pocos datos: estimación aproximada"), a range (low–high), and per-person share (Mode A) or projected balance vs fixed contributions (Mode B).
6. **Per person** (EQUAL) / **Contribution balance** (FIXED): month-by-month table and cumulative chart.
7. Export: CSV export of bills for a date range (share sheet on native, download on web).

All report math lives in `src/features/reports/` as pure functions with Jest tests (include fixtures for gas bi-monthly, Netflix 4-weekly, rent monthly, leap-year edge, a member joining mid-year, and seasonality).

## 10. Project quality requirements

- Folder structure: `app/` (routes), `src/components/ui`, `src/features/{auth,houses,members,categories,bills,reports,finance,schedule,profile,ocr}`, `src/lib`, `src/theme`, `src/i18n`, `src/dataconnect-generated` (generated), `dataconnect/`.
- Error boundaries, skeleton loaders, empty states with helpful CTAs, optimistic updates for simple mutations, toasts/haptics for feedback, offline-friendly query cache (retry, stale times), and no unhandled promise rejections.
- Pagination or date-range limits on bill queries.
- Unit tests (Jest + `jest-expo`) for: schedule engine, split calculations, projections, money formatting/parsing, invite code normalization. Run them and make them pass.
- ESLint + Prettier configured; `npm run typecheck`, `npm run lint`, `npm test` scripts must pass.
- `app.json`/`app.config.ts`: name "Costos Piso", slug `costos-piso`, bundle identifiers `com.costospiso.app` (iOS/Android), `userInterfaceStyle: "automatic"`, icons/splash placeholders, required iOS permission strings (camera, photo library) in Spanish, `expo-router` plugin, web `output: "static"`, favicon.
- `README.md` with: architecture, how to run (`npm i`, `npx expo start`, emulators with `firebase emulators:start`), how to provision Data Connect (`firebase init dataconnect`, `firebase deploy --only dataconnect`, SDK generation), how to deploy the static web app (`npx expo export --platform web && firebase deploy --only hosting`), EAS build notes for iOS/Android, security decisions and trade-offs, billing note (Data Connect/Cloud SQL requires the Blaze plan), assumptions, and a roadmap (OCR pipeline, push notifications for upcoming charges, Cloud Functions + custom claims for tighter Storage rules, multi-currency, expense splitting by custom percentages, receipts per payment).

## 11. Definition of done

- `npx expo start` runs on iOS, Android and web; `npx expo export --platform web` produces a deployable static `dist/`.
- Full flow works end-to-end (against the emulator at minimum): sign up → choose role → admin creates house → creates categories → generates invite code → roommate joins → admin uploads bills with PDF/photo → everyone sees totals → reports/projection render with real data → mode B balance works.
- Dark and light mode both look polished and iOS-native on every screen.
- Typecheck, lint and tests pass. No placeholder "TODO" screens except the explicitly marked OCR extension point.

Begin now. Start with the plan (briefly), then generate all files. At the end print a concise summary of what was built, assumptions made, and the exact commands I need to run to deploy.
