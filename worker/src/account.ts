import { and, eq, ne, notExists } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { APIError } from 'better-auth/api';

import type { Db } from './db/client';
import { members } from './db/schema';
import { purgePrefix } from './files';

/**
 * Cleanup that runs just before Better Auth deletes the user row (auth.ts `beforeDelete`; it has already checked the password).
 * Identity documents and files go, memberships are left
 * (active ones become REMOVED) and anonymised so bills and payments keep their history, and houses are never deleted
 * as a side effect. Every step is idempotent, so a failure halfway can simply be retried (the session is still valid).
 */
export async function deleteAccountData(db: Db, bucket: R2Bucket, uid: string) {
  // The last admin can't walk away from a house: it would be orphaned. They delete it (or, later, hand it over) first.
  const other = alias(members, 'other_admin');
  const orphaning = await db.select({ houseId: members.houseId }).from(members).where(and(
    eq(members.userId, uid), eq(members.role, 'ADMIN'), eq(members.status, 'ACTIVE'),
    notExists(db.select().from(other).where(and(eq(other.houseId, members.houseId), eq(other.role, 'ADMIN'), eq(other.status, 'ACTIVE'), ne(other.userId, uid)))),
  ));
  if (orphaning.length) throw new APIError('CONFLICT', { code: 'LAST_ADMIN', message: 'LAST_ADMIN', houseIds: orphaning.map((h) => h.houseId) } as never);

  await purgePrefix(bucket, `users/${uid}/`); // avatar + identity documents; user_documents rows cascade with the user
  await db.update(members).set({ status: 'REMOVED', removedAt: new Date() }).where(and(eq(members.userId, uid), eq(members.status, 'ACTIVE')));
  await db.update(members).set({ displayName: 'Cuenta eliminada', email: '', photoKey: null }).where(eq(members.userId, uid));
}
