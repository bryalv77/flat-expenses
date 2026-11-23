import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { Hono } from 'hono';

import { members, payments } from './db/schema';
import { MAX_LIST } from './config';
import { zListPaymentsQuery, zRecordPaymentBody } from './generated/zod.gen';
import { ERR } from '../../src/lib/api/errors';
import { houseId, noContentOr404, readBody, uuidParam } from './http';
import { guardAdmin, guardMember, type AppEnv } from './middleware';

// Reads: any active member. Writes: admins. Payments are immutable (no update).
export const paymentsApp = new Hono<AppEnv>();

const record = zRecordPaymentBody.strict();

paymentsApp.get('/', guardMember, async (c) => {
  const q = zListPaymentsQuery.safeParse(c.req.query());
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
