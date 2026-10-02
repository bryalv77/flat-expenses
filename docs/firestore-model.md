# Firestore model

Money is **integer cents**. Dates are ISO strings (`YYYY-MM-DD`) so range queries work; timestamps are Firestore `Timestamp`s set with `serverTimestamp()` (the rules require `== request.time`). Every write is validated by `firestore.rules` (exact key sets, types, ranges, enums). Tests: `npm run test:rules`.

```
users/{uid}                              email, displayName, photoPath, accountRole, locale, createdAt, updatedAt
users/{uid}/documents/{docId}            type (PASSPORT|NATIONAL_ID), storagePath, fileName, mimeType, sizeBytes, uploadedAt
houses/{houseId}                         name, address, currency('EUR'), splitMode, fixedContributionCents, contributionDayOfMonth,
                                         showBalanceToRoommates, createdBy, createdAt, updatedAt
houses/{houseId}/members/{uid}           uid, role (ADMIN|ROOMMATE), status (ACTIVE|REMOVED), joinedAt, removedAt,
                                         individualContributionCents, displayName, email, photoPath (denormalized), inviteCode
houses/{houseId}/categories/{id}         name, icon, color, amountType, expectedAmountCents, intervalUnit, intervalCount,
                                         anchorDate, isActive, sortOrder, notes, createdAt, updatedAt
houses/{houseId}/bills/{id}              categoryId, amountCents, chargeDate, periodStartDate, periodEndDate, effectiveDate,
                                         fileStoragePath, fileName, fileMimeType, fileSizeBytes, notes, ocrStatus, ocrData,
                                         createdBy, createdAt, updatedAt
houses/{houseId}/payments/{id}           memberId (= member uid), month ('YYYY-MM-01'), amountCents, note, paidAt, recordedBy
invites/{code}                           houseId, status, expiresAt, maxUses, usedCount, createdBy, createdAt
```

## Design decisions

- **Member document id = uid.** Rules decide access with one `get()` of `houses/{h}/members/{uid}`. `HouseMember.id`, `userId` and payment `memberId` are all that uid.
- **`ListMyHouses`** is a collection-group query `members where uid == auth.uid` (single-field collection-group index on `members.uid`, see `firestore.indexes.json`), then one `get` per house.
- **`effectiveDate`** is denormalized on each bill (`chargeDate ?? periodEndDate ?? creation date`; the rules check it matches the first two) so one range query `effectiveDate >= from and <= to` serves lists and reports.
- **Invites** live at `invites/{code}` (code = 8 chars, alphabet without I/L/O/0/1). A `get` by code is allowed to any signed-in user (needed to resolve the house); listing is admin-only. Joining is one batch: create `houses/{h}/members/{uid}` (role ROOMMATE, `inviteCode`) **and** `invites/{code}.usedCount += 1`; the rules validate both with `get()`/`getAfter()` (ACTIVE, not expired, `usedCount < maxUses`, same house).
- **House bootstrap** is one batch: `houses/{id}` + the creator's ADMIN member document.
- **Leaving / removal:** roommates can only set their own `status` to `REMOVED`; admins can remove/reactivate roommates but never an ADMIN, and `role` is immutable, so a house always keeps its admin. A removed user who was removed cannot self-rejoin with another invite (their member document exists); an admin reactivates them.
- **Identity documents** are owner-only in Firestore *and* Storage. Rules cannot express "admin of a house the owner belongs to" without Cloud Functions/custom claims, so admins cannot see them (`api.listMemberDocuments` returns `[]`).
- **Not enforced by rules:** unique category names per house (UI/zod), per-user quotas on how many houses/bills a signed-in user can create (see README "Cost & abuse controls").
- **Deleting a house** deletes children first (client-side batches), then `house + own member` in one batch. Other admins' member documents (if any) become orphans that they can delete themselves once the house is gone.
