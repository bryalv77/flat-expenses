import { and, asc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

import { bills, categories } from './db/schema';
import { guard, type AppEnv } from './middleware';

// Mounted at /api/houses/:id/categories (houses.ts). Reads: any active member. Writes: admins (as in firestore.rules).
export const categoriesApp = new Hono<AppEnv>();

// Same limits as validCategory() in firestore.rules.
const shape = z.object({
  name: z.string().trim().min(1).max(60),
  icon: z.string().min(1).max(40),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  amountType: z.enum(['FIXED', 'VARIABLE']),
  expectedAmountCents: z.number().int().min(0).max(10_000_000).nullable(),
  intervalUnit: z.enum(['DAY', 'WEEK', 'MONTH', 'YEAR']),
  intervalCount: z.number().int().min(1).max(1000),
  anchorDate: z.iso.date(),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(10_000),
  notes: z.string().max(500).nullable(),
});
const fixedNeedsAmount = (v: { amountType?: string; expectedAmountCents?: number | null }) =>
  v.amountType !== 'FIXED' || v.expectedAmountCents != null;
const create = shape.extend({ id: z.uuid() }).partial({ id: true, expectedAmountCents: true, isActive: true, sortOrder: true, notes: true }).strict()
  .refine(fixedNeedsAmount, { message: 'FIXED categories need expectedAmountCents', path: ['expectedAmountCents'] });
const update = shape.partial().strict();

const where = (houseId: string, id: string) => and(eq(categories.houseId, houseId), eq(categories.id, id));
const validId = (id: string) => z.uuid().safeParse(id).success;

categoriesApp.get('/', guard(false), async (c) =>
  c.json(await c.var.db.select().from(categories).where(eq(categories.houseId, c.req.param('id') ?? ''))
    .orderBy(asc(categories.sortOrder), asc(categories.name)).limit(200)),
);

categoriesApp.post('/', guard(true), async (c) => {
  const b = create.safeParse(await c.req.json().catch(() => null));
  if (!b.success) return c.json({ error: 'invalid', issues: b.error.issues }, 400);
  const [row] = await c.var.db.insert(categories).values({ ...b.data, houseId: c.req.param('id') ?? '' }).returning();
  return c.json(row, 201);
});

categoriesApp.patch('/:categoryId', guard(true), async (c) => {
  const id = c.req.param('categoryId');
  if (!validId(id)) return c.json({ error: 'not_found' }, 404);
  const b = update.safeParse(await c.req.json().catch(() => null));
  if (!b.success) return c.json({ error: 'invalid', issues: b.error.issues }, 400);
  const houseId = c.req.param('id') ?? '';
  const [current] = await c.var.db.select().from(categories).where(where(houseId, id));
  if (!current) return c.json({ error: 'not_found' }, 404);
  // The merged result must still be valid (e.g. switching to FIXED requires an amount).
  if (!fixedNeedsAmount({ ...current, ...b.data })) return c.json({ error: 'invalid', message: 'FIXED categories need expectedAmountCents' }, 400);
  const [row] = await c.var.db.update(categories).set(b.data).where(where(houseId, id)).returning();
  return c.json(row);
});

// Refuses (409 CATEGORY_HAS_BILLS) when bills still reference it; archive instead (PATCH isActive=false).
categoriesApp.delete('/:categoryId', guard(true), async (c) => {
  const id = c.req.param('categoryId');
  if (!validId(id)) return c.json({ error: 'not_found' }, 404);
  const houseId = c.req.param('id') ?? '';
  const [used] = await c.var.db.select({ id: bills.id }).from(bills).where(eq(bills.categoryId, id)).limit(1);
  if (used) return c.json({ error: 'CATEGORY_HAS_BILLS' }, 409);
  const rows = await c.var.db.delete(categories).where(where(houseId, id)).returning();
  return rows.length ? c.body(null, 204) : c.json({ error: 'not_found' }, 404);
});
