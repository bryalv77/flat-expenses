import { and, asc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

import { MAX_CONFIG_CENTS } from './config';
import { bills, categories } from './db/schema';
import { houseId, noContentOr404, notFound, readBody, uuidParam } from './http';
import { guardAdmin, guardMember, type AppEnv } from './middleware';

// Reads: any active member. Writes: admins.
export const categoriesApp = new Hono<AppEnv>();

const shape = z.object({
  name: z.string().trim().min(1).max(60),
  icon: z.string().min(1).max(40),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  amountType: z.enum(['FIXED', 'VARIABLE']),
  expectedAmountCents: z.number().int().min(0).max(MAX_CONFIG_CENTS).nullable(),
  intervalUnit: z.enum(['DAY', 'WEEK', 'MONTH', 'YEAR']),
  intervalCount: z.number().int().min(1).max(1000),
  anchorDate: z.iso.date(),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(10_000),
  notes: z.string().max(500).nullable(),
  names: z.record(z.string().regex(/^[a-z]{2,3}$/), z.string().trim().min(1).max(60)).refine((o) => Object.keys(o).length <= 12).nullable(),
});
const fixedNeedsAmount = (v: { amountType?: string; expectedAmountCents?: number | null }) =>
  v.amountType !== 'FIXED' || v.expectedAmountCents != null;
const create = shape.extend({ id: z.uuid() }).partial({ id: true, expectedAmountCents: true, isActive: true, sortOrder: true, notes: true, names: true }).strict()
  .refine(fixedNeedsAmount, { message: 'FIXED categories need expectedAmountCents', path: ['expectedAmountCents'] });
const update = shape.partial().strict();

const where = (houseId: string, id: string) => and(eq(categories.houseId, houseId), eq(categories.id, id));

categoriesApp.get('/', guardMember, async (c) =>
  c.json(await c.var.db.select().from(categories).where(eq(categories.houseId, houseId(c)))
    .orderBy(asc(categories.sortOrder), asc(categories.name)).limit(200)),
);

categoriesApp.post('/', guardAdmin, async (c) => {
  const b = await readBody(c, create);
  if (b.res) return b.res;
  const [row] = await c.var.db.insert(categories).values({ ...b.data, houseId: houseId(c) }).returning();
  return c.json(row, 201);
});

categoriesApp.patch('/:categoryId', guardAdmin, uuidParam('categoryId'), async (c) => {
  const id = c.req.param('categoryId');
  const b = await readBody(c, update);
  if (b.res) return b.res;
  const hid = houseId(c);
  const [current] = await c.var.db.select().from(categories).where(where(hid, id));
  if (!current) return notFound(c);
  // The merged result must still be valid (e.g. switching to FIXED requires an amount).
  if (!fixedNeedsAmount({ ...current, ...b.data })) return c.json({ error: 'invalid', message: 'FIXED categories need expectedAmountCents' }, 400);
  const [row] = await c.var.db.update(categories).set(b.data).where(where(hid, id)).returning();
  return c.json(row);
});

// Refuses (409 CATEGORY_HAS_BILLS) when bills still reference it; archive instead (PATCH isActive=false).
categoriesApp.delete('/:categoryId', guardAdmin, uuidParam('categoryId'), async (c) => {
  const id = c.req.param('categoryId');
  const [used] = await c.var.db.select({ id: bills.id }).from(bills).where(eq(bills.categoryId, id)).limit(1);
  if (used) return c.json({ error: 'CATEGORY_HAS_BILLS' }, 409);
  const rows = await c.var.db.delete(categories).where(where(houseId(c), id)).returning();
  return noContentOr404(c, rows);
});
