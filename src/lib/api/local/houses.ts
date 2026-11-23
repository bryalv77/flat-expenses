import { z } from 'zod';

import type { House, HouseMember, HouseRole } from '@/types/domain';

import { MAX_MEMBERS_LIST } from '../../limits';
import { zCreateHouseBody, zUpdateHouseBody } from '../generated/zod.gen';
import { trimmed } from '../rules';
import type { Api } from '../types';
import type { LocalCtx } from './ctx';
import { mapMember, type MemberRow } from './members';
import { ensureUser } from './user';

const createSchema = zCreateHouseBody.extend({ id: z.string().min(1).max(64) });
const updateSchema = zUpdateHouseBody.extend({ houseId: z.string() });

type HouseRow = {
  id: string; name: string; address: string | null; currency: string; split_mode: House['splitMode'];
  fixed_contribution_cents: number | null; contribution_day_of_month: number | null; show_balance_to_roommates: number;
};
const mapHouse = (h: HouseRow): House => ({
  id: h.id,
  name: h.name,
  address: h.address,
  currency: h.currency,
  splitMode: h.split_mode,
  fixedContributionCents: h.fixed_contribution_cents,
  contributionDayOfMonth: h.contribution_day_of_month,
  showBalanceToRoommates: h.show_balance_to_roommates === 1,
});

const COLUMNS: Record<string, string> = {
  name: 'name', address: 'address', splitMode: 'split_mode', fixedContributionCents: 'fixed_contribution_cents',
  contributionDayOfMonth: 'contribution_day_of_month', showBalanceToRoommates: 'show_balance_to_roommates',
};
const toSql = (v: unknown) => (typeof v === 'boolean' ? (v ? 1 : 0) : (v as string | number | null));

export function makeHousesApi(ctx: LocalCtx): Partial<Api> {
  const { db } = ctx;
  return {
    createHouse: async (input) => {
      const v = createSchema.parse(input);
      const now = ctx.now();
      await db.transaction(async () => {
        await ensureUser(db, ctx.userId, now);
        const u = await db.get<{ display_name: string; email: string | null; photo_path: string | null }>(
          'select display_name, email, photo_path from users where id = ?', [ctx.userId]);
        await db.run(
          `insert into houses (id, name, address, currency, split_mode, fixed_contribution_cents, contribution_day_of_month,
           show_balance_to_roommates, created_by, created_at, updated_at) values (?, ?, ?, 'EUR', ?, ?, ?, ?, ?, ?, ?)`,
          [v.id, trimmed(v.name), v.address?.trim() ?? null, v.splitMode ?? 'EQUAL', v.fixedContributionCents ?? null,
            v.contributionDayOfMonth ?? null, v.showBalanceToRoommates === false ? 0 : 1, ctx.userId, now, now],
        );
        await db.run(
          `insert into members (house_id, user_id, role, status, joined_at, display_name, email, photo_path)
           values (?, ?, 'ADMIN', 'ACTIVE', ?, ?, ?, ?)`,
          [v.id, ctx.userId, now, u?.display_name ?? 'Roommie', u?.email ?? '', u?.photo_path ?? null],
        );
      });
    },
    updateHouse: async (input) => {
      const { houseId, ...rest } = updateSchema.parse(input);
      const sets = Object.entries({ ...rest, name: rest.name?.trim(), address: rest.address?.trim() ?? rest.address }).filter(([, x]) => x !== undefined);
      await db.run(
        `update houses set ${[...sets.map(([k]) => `${COLUMNS[k]} = ?`), 'updated_at = ?'].join(', ')} where id = ?`,
        [...sets.map(([, x]) => toSql(x)), ctx.now(), houseId],
      );
    },
    listMyHouses: async () => {
      const rows = await db.all<HouseRow & { role: HouseRole }>(
        `select h.*, m.role from members m join houses h on h.id = m.house_id
         where m.user_id = ? and m.status = 'ACTIVE' order by h.created_at`, [ctx.userId]);
      return rows.map((r) => ({ ...mapHouse(r), role: r.role }));
    },
    getHouse: async ({ houseId }): Promise<{ house: House; members: HouseMember[] } | null> => {
      const h = await db.get<HouseRow>('select * from houses where id = ?', [houseId]);
      if (!h) return null;
      const members = await db.all<MemberRow>(`select * from members where house_id = ? order by joined_at limit ${MAX_MEMBERS_LIST}`, [houseId]);
      return { house: mapHouse(h), members: members.map(mapMember) };
    },
    deleteHouse: async ({ houseId }) => {
      await db.run('delete from houses where id = ?', [houseId]); // FK cascade removes the children
      await ctx.deleteFolder(`houses/${houseId}`); // after commit: files are not transactional
    },
  };
}
