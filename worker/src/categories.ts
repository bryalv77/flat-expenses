import { and, asc, eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { fixedNeedsAmount, trimmed, trimmedNames } from '../../src/lib/api/rules';
import { MAX_CATEGORIES_LIST } from './config';
import { zCreateCategoryBody, zUpdateCategoryBody } from './generated/zod.gen';
import { ERR } from '../../src/lib/api/errors';
import { bills, categories } from './db/schema';
import { houseId, noContentOr404, notFound, readBody, uuidParam } from './http';
import { guardAdmin, guardMember, type AppEnv } from './middleware';

// Reads: any active member. Writes: admins.
export const categoriesApp = new Hono<AppEnv>();

const create = zCreateCategoryBody.strict().refine(fixedNeedsAmount, { message: 'FIXED categories need expectedAmountCents', path: ['expectedAmountCents'] });
const update = zUpdateCategoryBody.strict();
const clean = <T extends { name?: string; names?: Record<string, string> | null }>(v: T): T => ({
  ...v,
  ...(v.name !== undefined && { name: trimmed(v.name) }),
  ...(v.names ? { names: trimmedNames(v.names) } : {}),
});

const where = (houseId: string, id: string) => and(eq(categories.houseId, houseId), eq(categories.id, id));

categoriesApp.get('/', guardMember, async (c) =>
  c.json(await c.var.db.select().from(categories).where(eq(categories.houseId, houseId(c)))
    .orderBy(asc(categories.sortOrder), asc(categories.name)).limit(MAX_CATEGORIES_LIST)),
);

categoriesApp.post('/', guardAdmin, async (c) => {
  const b = await readBody(c, create);
  if (b.res) return b.res;
  const [row] = await c.var.db.insert(categories).values({ ...clean(b.data), houseId: houseId(c) }).returning();
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
  const fields = clean(b.data);
  if (!fixedNeedsAmount({ ...current, ...fields })) return c.json({ error: 'invalid', message: 'FIXED categories need expectedAmountCents' }, 400);
  const [row] = await c.var.db.update(categories).set(fields).where(where(hid, id)).returning();
  return c.json(row);
});

// Refuses (409 CATEGORY_HAS_BILLS) when bills still reference it; archive instead (PATCH isActive=false).
categoriesApp.delete('/:categoryId', guardAdmin, uuidParam('categoryId'), async (c) => {
  const id = c.req.param('categoryId');
  const [used] = await c.var.db.select({ id: bills.id }).from(bills).where(eq(bills.categoryId, id)).limit(1);
  if (used) return c.json({ error: ERR.CATEGORY_HAS_BILLS }, 409);
  const rows = await c.var.db.delete(categories).where(where(houseId(c), id)).returning();
  return noContentOr404(c, rows);
});
