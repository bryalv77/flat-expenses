import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

import { members, payments } from './db/schema';
import { MAX_CENTS, MAX_LIST } from './config';
import { ERR } from '../../src/lib/api/errors';
import { houseId, noContentOr404, readBody, uuidParam } from './http';
import { guardAdmin, guardMember, type AppEnv } from './middleware';

// Reads: any active member. Writes: admins. Payments are immutable (no update).
export const paymentsApp = new Hono<AppEnv>();

const month = z.iso.date().regex(/^20\d\d-(0[1-9]|1[0-2])-01$/, 'first day of a month'); // matches payments_month check
const record = z.object({
  id: z.uuid().optional(),
  memberId: z.string().min(1).max(128),
  month,
  amountCents: z.number().int().min(1).max(MAX_CENTS),
  note: z.string().max(200).nullish(),
}).strict();

paymentsApp.get('/', guardMember, async (c) => {
  const q = z.object({ from: month, to: month }).safeParse(c.req.query());
  if (!q.success) return c.json({ error: 'invalid', issues: q.error.issues }, 400);
  return c.json(
    await c.var.db.select().from(payments)
      .where(and(eq(payments.houseId, houseId(c)), gte(payments.month, q.data.from), lte(payments.month, q.data.to)))
      .orderBy(desc(payments.month), desc(payments.paidAt)).limit(MAX_LIST),
  );
});

paymentsApp.post('/', guardAdmin, async (c) => {
  const b = await readBody(c, record);
  if (b.res) return b.res;
  const hid = houseId(c);
  // The payer must be a member of this house (active or removed: back payments for someone who left are valid).
  const [m] = await c.var.db.select({ userId: members.userId }).from(members).where(and(eq(members.houseId, hid), eq(members.userId, b.data.memberId)));
  if (!m) return c.json({ error: ERR.INVALID_MEMBER }, 400);
  const [row] = await c.var.db.insert(payments).values({ ...b.data, houseId: hid, recordedBy: c.var.uid }).returning();
  return c.json(row, 201);
});

paymentsApp.delete('/:paymentId', guardAdmin, uuidParam('paymentId'), async (c) => {
  const rows = await c.var.db.delete(payments).where(and(eq(payments.houseId, houseId(c)), eq(payments.id, c.req.param('paymentId')))).returning();
  return noContentOr404(c, rows);
});
