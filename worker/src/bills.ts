import { and, asc, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

import { billFiles, bills, categories } from './db/schema';
import { DOCUMENT_MIME_TYPES, MAX_BILL_FILES, MAX_CENTS, MAX_LIST, MAX_NOTES } from './config';
import { MAX_BYTES, deleteObjects, parseKey } from './files';
import { houseId, notFound, readBody, uuidParam } from './http';
import { guardAdmin, guardMember, type AppEnv } from './middleware';

// Reads: any active member. Writes: admins.
// Attachments: the client uploads to PUT /api/files/houses/:id/bills/:folder/:file first, then sends `files` (max 5) here;
// sending `files` on PATCH replaces the whole set, and objects that are no longer referenced are deleted from R2.
export const billsApp = new Hono<AppEnv>();

const date = z.iso.date();
const fileRef = z.object({
  objectKey: z.string().max(300),
  fileName: z.string().min(1).max(150),
  mimeType: z.enum(DOCUMENT_MIME_TYPES),
  sizeBytes: z.number().int().min(0).max(MAX_BYTES.bill),
}).strict();
const shape = z.object({
  files: z.array(fileRef).max(MAX_BILL_FILES),
  categoryId: z.uuid(),
  amountCents: z.number().int().min(1).max(MAX_CENTS),
  chargeDate: date.nullable(),
  periodStartDate: date.nullable(),
  periodEndDate: date.nullable(),
  notes: z.string().max(MAX_NOTES).nullable(),
});
const create = shape.extend({ id: z.uuid() }).partial({ id: true, files: true, chargeDate: true, periodStartDate: true, periodEndDate: true, notes: true }).strict();
const update = shape.partial().strict();

type Db = AppEnv['Variables']['db'];
type FileRef = z.infer<typeof fileRef>;

const filesByBill = async (db: Db, billIds: string[]) => {
  const map = new Map<string, (typeof billFiles.$inferSelect)[]>();
  if (!billIds.length) return map;
  const rows = await db.select().from(billFiles).where(inArray(billFiles.billId, billIds)).orderBy(asc(billFiles.position));
  for (const f of rows) map.set(f.billId, [...(map.get(f.billId) ?? []), f]);
  return map;
};
const withFiles = async (db: Db, rows: (typeof bills.$inferSelect)[]) => {
  const map = await filesByBill(db, rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, files: map.get(r.id) ?? [] }));
};

/** Every referenced object must live under this house's bills prefix, be unique, and exist in R2 with the declared size. */
const checkFiles = async (bucket: R2Bucket, houseId: string, files: FileRef[]) => {
  if (new Set(files.map((f) => f.objectKey)).size !== files.length) return false;
  for (const f of files) {
    const p = parseKey(f.objectKey);
    if (p?.kind !== 'bill' || p.owner !== houseId) return false;
    if ((await bucket.head(f.objectKey))?.size !== f.sizeBytes) return false;
  }
  return true;
};
const insertFiles = (db: Db, billId: string, files: FileRef[]) =>
  files.length ? db.insert(billFiles).values(files.map((f, position) => ({ ...f, billId, position }))) : Promise.resolve();

const where = (houseId: string, id: string) => and(eq(bills.houseId, houseId), eq(bills.id, id));

// A category id from another house would pass the FK, so check it belongs to this house.
const categoryInHouse = async (db: Db, houseId: string, categoryId: string) =>
  (await db.select({ id: categories.id }).from(categories).where(and(eq(categories.houseId, houseId), eq(categories.id, categoryId))).limit(1)).length > 0;

// Bills whose effective date (charge date, else period end, else creation day) is in [from, to], newest first.
billsApp.get('/', guardMember, async (c) => {
  const q = z.object({ from: date, to: date, categoryId: z.uuid().optional() }).safeParse(c.req.query());
  if (!q.success) return c.json({ error: 'invalid', issues: q.error.issues }, 400);
  const { from, to, categoryId } = q.data;
  const rows = await c.var.db.select().from(bills)
    .where(and(eq(bills.houseId, houseId(c)), gte(bills.effectiveDate, from), lte(bills.effectiveDate, to), categoryId ? eq(bills.categoryId, categoryId) : undefined))
    .orderBy(desc(bills.effectiveDate), desc(bills.createdAt)).limit(MAX_LIST);
  return c.json(await withFiles(c.var.db, rows));
});

billsApp.get('/:billId', guardMember, uuidParam('billId'), async (c) => {
  const [row] = await c.var.db.select().from(bills).where(where(houseId(c), c.req.param('billId')));
  return row ? c.json((await withFiles(c.var.db, [row]))[0]) : notFound(c);
});

billsApp.post('/', guardAdmin, async (c) => {
  const b = await readBody(c, create);
  if (b.res) return b.res;
  const hid = houseId(c);
  if (!(await categoryInHouse(c.var.db, hid, b.data.categoryId))) return c.json({ error: 'invalid_category' }, 400);
  const { files = [], ...fields } = b.data;
  if (!(await checkFiles(c.env.BUCKET, hid, files))) return c.json({ error: 'invalid_files' }, 400);
  const [row] = await c.var.db.insert(bills).values({ ...fields, houseId: hid, createdBy: c.var.uid }).returning();
  try {
    await insertFiles(c.var.db, row!.id, files);
  } catch (e) {
    await c.var.db.delete(bills).where(eq(bills.id, row!.id)); // no half-created bill (neon-http has no transactions)
    throw e;
  }
  return c.json((await withFiles(c.var.db, [row!]))[0], 201);
});

billsApp.patch('/:billId', guardAdmin, uuidParam('billId'), async (c) => {
  const id = c.req.param('billId');
  const b = await readBody(c, update);
  if (b.res) return b.res;
  const hid = houseId(c);
  if (b.data.categoryId && !(await categoryInHouse(c.var.db, hid, b.data.categoryId))) return c.json({ error: 'invalid_category' }, 400);
  const { files, ...fields } = b.data;
  if (files && !(await checkFiles(c.env.BUCKET, hid, files))) return c.json({ error: 'invalid_files' }, 400);
  const previous = files ? (await filesByBill(c.var.db, [id])).get(id) ?? [] : [];
  // effectiveDate is a generated column, so it follows chargeDate/periodEndDate on its own.
  // `set({})` is an error in drizzle, so bump updatedAt when only files change.
  const [row] = await c.var.db.update(bills).set(Object.keys(fields).length ? fields : { updatedAt: new Date() }).where(where(hid, id)).returning();
  if (!row) return notFound(c);
  if (files) {
    await c.var.db.delete(billFiles).where(eq(billFiles.billId, id));
    await insertFiles(c.var.db, id, files);
    const kept = new Set(files.map((f) => f.objectKey));
    await deleteObjects(c.env.BUCKET, previous.map((f) => f.objectKey).filter((k) => !kept.has(k)));
  }
  return c.json((await withFiles(c.var.db, [row]))[0]);
});

billsApp.delete('/:billId', guardAdmin, uuidParam('billId'), async (c) => {
  const id = c.req.param('billId');
  const keys = ((await filesByBill(c.var.db, [id])).get(id) ?? []).map((f) => f.objectKey); // read before the cascade removes the rows
  const rows = await c.var.db.delete(bills).where(where(houseId(c), id)).returning();
  if (!rows.length) return notFound(c);
  await deleteObjects(c.env.BUCKET, keys);
  return c.body(null, 204);
});
