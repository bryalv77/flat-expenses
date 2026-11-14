import { z } from 'zod';

import type { HouseMember } from '@/types/domain';

import type { Api } from '../types';
import type { LocalCtx } from './ctx';

export type MemberRow = {
  user_id: string; role: HouseMember['role']; status: HouseMember['status']; joined_at: string; removed_at: string | null;
  individual_contribution_cents: number | null; display_name: string | null; email: string | null; photo_path: string | null;
};

export const mapMember = (m: MemberRow): HouseMember => ({
  id: m.user_id,
  userId: m.user_id,
  displayName: m.display_name ?? '',
  email: m.email ?? '',
  photoPath: m.photo_path,
  role: m.role,
  status: m.status,
  joinedAt: m.joined_at,
  removedAt: m.removed_at,
  individualContributionCents: m.individual_contribution_cents,
});

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const cents = z.number().int().min(0).max(10_000_000).nullable();
const guestSchema = z.object({
  houseId: z.string(),
  id: z.string().regex(/^guest_[A-Za-z0-9]{12,40}$/),
  displayName: z.string().trim().min(1).max(100),
  joinedAt: day,
  removedAt: day.nullable(),
  individualContributionCents: cents,
});
const noon = (d: string) => `${d}T12:00:00.000Z`;

export function makeMembersApi(ctx: LocalCtx): Partial<Api> {
  const { db } = ctx;
  return {
    removeMember: async (v) => {
      const removedAt = v.removedAt ? noon(day.parse(v.removedAt)) : ctx.now();
      const m = await db.get<{ role: string }>('select role from members where house_id = ? and user_id = ?', [v.houseId, v.memberId]);
      if (m?.role === 'ADMIN') throw new Error('An ADMIN cannot be removed');
      await db.run(`update members set status = 'REMOVED', removed_at = ? where house_id = ? and user_id = ?`, [removedAt, v.houseId, v.memberId]);
    },
    reactivateMember: async (v) => {
      await db.run(`update members set status = 'ACTIVE', removed_at = null where house_id = ? and user_id = ?`, [v.houseId, v.memberId]);
    },
    createGuestMember: async (input) => {
      const v = guestSchema.parse(input);
      await db.run(
        `insert into members (house_id, user_id, role, status, joined_at, removed_at, individual_contribution_cents, display_name, email)
         values (?, ?, 'ROOMMATE', ?, ?, ?, ?, ?, '')`,
        [v.houseId, v.id, v.removedAt ? 'REMOVED' : 'ACTIVE', noon(v.joinedAt), v.removedAt ? noon(v.removedAt) : null,
          v.individualContributionCents, v.displayName],
      );
    },
    setMemberContribution: async (v) => {
      const c = cents.parse(v.individualContributionCents);
      await db.run('update members set individual_contribution_cents = ? where house_id = ? and user_id = ?', [c, v.houseId, v.memberId]);
    },
    listMembers: async ({ houseId }) =>
      (await db.all<MemberRow>('select * from members where house_id = ? order by joined_at limit 100', [houseId])).map(mapMember),
  };
}
