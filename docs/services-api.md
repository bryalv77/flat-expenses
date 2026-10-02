# Services API (for UI authors)

Everything lives under `src/`. Import with the `@/` alias. All money is integer cents; dates are ISO `YYYY-MM-DD`
(timestamps are full ISO strings). Domain types: `@/types/domain`.

## Setup
- Providers (in `app/_layout.tsx`): `QueryClientProvider client={queryClient}` (`@/lib/queryClient`) → `AuthProvider` (`@/features/auth`).
- `@/lib/firebase`: `app`, `auth`, `storage`, `db` (Firestore), `USE_EMULATORS`, `featureFlags {google, apple, googleWebClientId}`.
- `@/lib/uiStore` — `useUiStore()` (persisted): `themeMode: 'system'|'light'|'dark'`, `locale: 'es'|'en'`, `activeHouseId`, `setThemeMode(m)`, `setLocale(l)`, `setActiveHouseId(id|null)`.

## Auth — `@/features/auth`
`useAuth(): AuthContextValue`
- `firebaseUser: FirebaseUser | null`, `initializing: boolean` (show splash until false), `profileReady: boolean` (User row exists), `isPasswordAccount`
- `features: {google, apple}`
- `signIn(email, password)`, `signUp({email, password, displayName, accountRole?})`, `signOut()`, `resetPassword(email)`
- `changePassword(current, next)`, `deleteAccount(password?)` (throws `auth/requires-recent-login` for stale social sessions)

`useGoogleSignIn()` / `useAppleSignIn(): { enabled: boolean; signIn(): Promise<void> }` (Apple only enabled on iOS/web + flag).

## Profile — `@/features/profile/hooks`
- `useMe()` → `User | null`; `useUpdateProfile()` mutate `{displayName?, locale?, photoPath?}` (optimistic)
- `useUploadAvatar()` mutate `{file: PickedFile, previousPath?, onProgress?}` → new storage path
- `useMyDocuments()` → `UserDocument[]`; `useAddDocument()` mutate `{type: DocumentType, file, onProgress?}`; `useDeleteDocument()` mutate `UserDocument` (optimistic)
- `useMemberDocuments(houseId, userId, enabled?)` — SENSITIVE, admin only

## Houses — `@/features/houses/hooks`
- `useMyHouses()` → `HouseWithRole[]` (`House & {role}`)
- `useActiveHouse()` → `{house?, isAdmin, isLoading, houses}` (resolves/persists active house)
- `useHouse(houseId)` → `{house: House, members: HouseMember[]} | null`
- `useCreateHouse()` mutate `{name, address?, splitMode?, fixedContributionCents?, contributionDayOfMonth?, showBalanceToRoommates?}` → new houseId (activates it)
- `useUpdateHouse()` mutate `{houseId, ...partial}`; `useDeleteHouse()` mutate `houseId`

## Members & invites — `@/features/members/hooks`
- `useMembers(houseId)` → `HouseMember[]` (includes REMOVED, with `removedAt`)
- `useInvites(houseId, enabled?)` → `HouseInvite[]` (admin)
- `useCreateInvite(houseId)` mutate `{expiresInDays?=7, maxUses?=1}` → normalized 8-char code
- `useRevokeInvite(houseId)` mutate `inviteId`
- `useRedeemInvite()` mutate `rawCode` → joined houseId | null (activates it)
- `useRemoveMember(houseId)` / `useReactivateMember(houseId)` mutate `memberId`
- `useSetMemberContribution(houseId)` mutate `{memberId, cents: number|null}`
- `useLeaveHouse()` mutate `houseId`
- `@/features/members/inviteCode`: `normalizeInviteCode`, `formatInviteCode` (`K7QX-M2PD`), `isValidInviteCode`, `generateInviteCode`, `INVITE_ALPHABET`

## Categories — `@/features/categories/hooks`
- `useCategories(houseId)` → `ExpenseCategory[]` (sorted; includes archived — filter on `isActive`)
- `useCreateCategory(houseId)` mutate `CategoryInput` → id; `useUpdateCategory(houseId)` mutate `Partial<CategoryInput> & {id}`
- `useArchiveCategory(houseId)` mutate `{id, isActive}` (optimistic); `useReorderCategories(houseId)` mutate `orderedIds[]` (optimistic)
- `useSeedSuggestedCategories(houseId)` mutate `void`; `SUGGESTED_CATEGORIES` in `./suggested`

## Bills — `@/features/bills/hooks`
- `useBills(houseId, {from, to, categoryId?})` → `Bill[]` by EFFECTIVE date, newest first (limit the range!)
- `useBill(houseId, id)` → `Bill | null`
- `useCreateBill(houseId)` mutate `{fields: {categoryId, amountCents, chargeDate?, periodStartDate?, periodEndDate?, notes?}, file?: PickedFile, onProgress?}` → id
- `useUpdateBill(houseId)` mutate `{id, fields, newFile?, oldFilePath?, removeFile?, onProgress?}`
- `useDeleteBill(houseId)` mutate `Bill` (optimistic)

## Payments — `@/features/payments/hooks`
- `usePayments(houseId, {from, to})` → `MemberPayment[]` (`month` = first of month)
- `useRecordPayment(houseId)` mutate `{memberId, month, amountCents, note?}`; `useDeletePayment(houseId)` mutate `id`

## Files — `@/lib/storage`, `@/lib/useFileUrl`
- `PickedFile {uri, name, mimeType, size?}`; `prepareFile(file, kind)` (validate + compress/HEIC→JPEG); `validateFile`; `FileValidationError {code: 'unsupported-type'|'too-large'}`
- `uploadFile(path, file, onProgress?)`, `getFileUrl(path)`, `deleteFile(path)`, `deleteFolder(path)`, `storagePaths`, `sanitizeFileName`, `newId()`, `MAX_BYTES`, `ALLOWED_MIME_TYPES`
- `useFileUrl(storagePath)` → react-query result with the download URL (use for avatars, bill/document previews).

## Low level
`@/lib/db` exports `api` (Firestore, one function per former Data Connect operation; see docs/firestore-model.md) — prefer the hooks. `@/lib/queryKeys` (`qk`), `@/lib/optimistic`.

## Notes
- Firestore/Storage security rules enforce authorization server-side (member reads, admin writes); hooks do not duplicate it — hide admin UI with `useActiveHouse().isAdmin`.
- Bill queries run three server queries (charge date / period end / createdAt) and merge, to honour the effective-date rule.
