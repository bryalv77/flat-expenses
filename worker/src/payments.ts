import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

import { members, payments } from './db/schema';
import { guard, type AppEnv } from './middleware';

// Mounted at /api/houses/:id/payments (houses.ts). Reads: any active member. Writes: admins. Payments are immutable (no update), as in firestore.rules.
export const paymentsApp = new Hono<AppEnv>();

const MAX_LIST = 2000;
const month = z.iso.date().regex(/^20\d\d-(0[1-9]|1[0-2])-01$/, 'first day of a month'); // matches payments_month check
const record = z.object({
  id: z.uuid().optional(),
  memberId: z.string().min(1).max(128),
  month,
  amountCents: z.number().int().min(1).max(9_999_999),
  note: z.string().max(200).nullish(),
}).strict();

paymentsApp.get('/', guard(false), async (c) => {
  const q = z.object({ from: month, to: month }).safeParse(c.req.query());
  if (!q.success) return c.json({ error: 'invalid', issues: q.error.issues }, 400);
  return c.json(
    await c.var.db.select().from(payments)
      .where(and(eq(payments.houseId, c.req.param('id') ?? ''), gte(payments.month, q.data.from), lte(payments.month, q.data.to)))
      .orderBy(desc(payments.month), desc(payments.paidAt)).limit(MAX_LIST),
  );
});

paymentsApp.post('/', guard(true), async (c) => {
  const b = record.safeParse(await c.req.json().catch(() => null));
  if (!b.success) return c.json({ error: 'invalid', issues: b.error.issues }, 400);
  const houseId = c.req.param('id') ?? '';
  // The payer must be a member of this house (active or removed: back payments for someone who left are valid).
  const [m] = await c.var.db.select({ userId: members.userId }).from(members).where(and(eq(members.houseId, houseId), eq(members.userId, b.data.memberId)));
  if (!m) return c.json({ error: 'invalid_member' }, 400);
  const [row] = await c.var.db.insert(payments).values({ ...b.data, houseId, recordedBy: c.var.uid }).returning();
  return c.json(row, 201);
});

paymentsApp.delete('/:paymentId', guard(true), async (c) => {
  const id = c.req.param('paymentId');
  if (!z.uuid().safeParse(id).success) return c.json({ error: 'not_found' }, 404);
  const rows = await c.var.db.delete(payments).where(and(eq(payments.houseId, c.req.param('id') ?? ''), eq(payments.id, id))).returning();
  return rows.length ? c.body(null, 204) : c.json({ error: 'not_found' }, 404);
});
