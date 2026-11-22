import { z } from 'zod';

import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales';

import type { Api } from '../types';
import type { LocalCtx } from './ctx';
import type { SqlDb } from './sql';

const profile = z.object({
  displayName: z.string().trim().min(1).max(100).optional(),
  photoPath: z.string().max(300).nullable().optional(),
  locale: z.string().refine(isLocale).optional(),
  accountRole: z.enum(['ADMIN', 'ROOMMATE']).optional(),
});

export async function ensureUser(db: SqlDb, id: string, now: string): Promise<void> {
  await db.run(
    `insert or ignore into users (id, email, display_name, account_role, created_at, updated_at) values (?, '', 'Roommie', 'ADMIN', ?, ?)`,
    [id, now, now],
  );
}

type UserRow = { id: string; email: string | null; display_name: string; photo_path: string | null; account_role: 'ADMIN' | 'ROOMMATE'; locale: string | null };

export function makeUserApi(ctx: LocalCtx): Partial<Api> {
  const { db } = ctx;
  return {
    upsertUser: async (v) => {
      const p = profile.parse({ displayName: v.displayName, locale: v.locale, accountRole: v.accountRole });
      const now = ctx.now();
      await db.transaction(async () => {
        await ensureUser(db, ctx.userId, now);
        await db.run(
          `update users set email = ?, display_name = coalesce(?, display_name), locale = coalesce(?, locale),
           account_role = coalesce(?, account_role), updated_at = ? where id = ?`,
          [v.email ?? '', p.displayName ?? null, p.locale ?? null, p.accountRole ?? null, now, ctx.userId],
        );
      });
    },
    // Matches db.ts (always empty); documents themselves are unavailable locally.
    listMemberDocuments: async () => [],
    getMe: async () => {
      await ensureUser(db, ctx.userId, ctx.now()); // the local user always exists
      const u = await db.get<UserRow>('select * from users where id = ?', [ctx.userId]);
      if (!u) return null;
      return {
        id: u.id,
        email: u.email ?? '',
        displayName: u.display_name,
        photoPath: u.photo_path,
        accountRole: u.account_role,
        locale: isLocale(u.locale) ? u.locale : DEFAULT_LOCALE,
      };
    },
    updateMyProfile: async (v) => {
      const p = profile.parse(v);
      const now = ctx.now();
      await db.transaction(async () => {
        await ensureUser(db, ctx.userId, now);
        await db.run(
          `update users set display_name = coalesce(?, display_name), locale = coalesce(?, locale),
           account_role = coalesce(?, account_role), updated_at = ? where id = ?`,
          [p.displayName ?? null, p.locale ?? null, p.accountRole ?? null, now, ctx.userId],
        );
        if (p.photoPath !== undefined) await db.run('update users set photo_path = ? where id = ?', [p.photoPath, ctx.userId]);
        // Denormalised copy in each membership.
        if (p.displayName !== undefined) await db.run('update members set display_name = ? where user_id = ?', [p.displayName, ctx.userId]);
        if (p.photoPath !== undefined) await db.run('update members set photo_path = ? where user_id = ?', [p.photoPath, ctx.userId]);
      });
    },
  };
}
