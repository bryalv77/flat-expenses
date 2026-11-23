import { z } from 'zod';

import type { MemberPayment } from '@/types/domain';
import { ERR } from '../errors';
import { zListPaymentsQuery, zRecordPaymentBody } from '../generated/zod.gen';
import { MAX_LIST } from '../../limits';
import type { Api } from '../types';
import type { LocalCtx } from './ctx';

const record = zRecordPaymentBody.extend({ id: z.string().min(1), houseId: z.string().min(1) });
const range = zListPaymentsQuery.extend({ houseId: z.string() });

export function makePaymentsApi(ctx: LocalCtx): Partial<Api> {
  const { db } = ctx;
  return {
    recordPayment: async (v) => {
      const p = record.parse(v);
      // Active or removed members are fine (back payments); strangers are not.
      const m = await db.get('select 1 from members where house_id = ? and user_id = ?', [p.houseId, p.memberId]);
      if (!m) throw new Error(ERR.INVALID_MEMBER);
      await db.run(
        'insert into payments (id, house_id, member_id, month, amount_cents, note, paid_at, recorded_by) values (?,?,?,?,?,?,?,?)',
        [p.id, p.houseId, p.memberId, p.month, p.amountCents, p.note ?? null, ctx.now(), ctx.userId],
      );
    },
    deletePayment: async (v) => {
      await db.run('delete from payments where id = ? and house_id = ?', [v.id, v.houseId]);
    },
    listPayments: async (v) => {
      const q = range.parse(v);
      const rows = await db.all<{ id: string; member_id: string; month: string; amount_cents: number; paid_at: string; note: string | null }>(
        'select * from payments where house_id = ? and month >= ? and month <= ? order by month desc, paid_at desc limit ?',
        [q.houseId, q.from, q.to, MAX_LIST],
      );
      return rows.map((r): MemberPayment => ({ id: r.id, memberId: r.member_id, month: r.month, amountCents: r.amount_cents, paidAt: r.paid_at, note: r.note }));
    },
  };
}
