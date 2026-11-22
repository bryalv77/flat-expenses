import { and, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

import { user, userDocuments, members } from './db/schema';
import { DOC_MIME, MAX_BYTES, deleteObjects, parseKey } from './files';
import { notFound, readBody, rowOr404, uuidParam } from './http';
import { session, type AppEnv } from './middleware';

export const meApp = new Hono<AppEnv>();
meApp.use('*', session);

meApp.get('/', async (c) => {
  const [u] = await c.var.db.select().from(user).where(eq(user.id, c.var.uid));
  return rowOr404(c, u);
});

const profile = z.object({
  displayName: z.string().trim().min(1).max(100),
  photoKey: z.string().max(500).nullable(),
  locale: z.string().max(10),
  accountRole: z.enum(['ADMIN', 'ROOMMATE']),
}).partial().strict();

meApp.patch('/', async (c) => {
  const b = await readBody(c, profile);
  if (b.res) return b.res;
  const { displayName, photoKey, locale, accountRole } = b.data;
  const { db, uid } = c.var;
  if (photoKey) {
    const p = parseKey(photoKey);
    if (p?.kind !== 'avatar' || p.owner !== uid) return c.json({ error: 'invalid_photo_key' }, 400); // only your own avatar object
  }
  const [u] = await db.update(user).set({ name: displayName, photoKey, locale, accountRole }).where(eq(user.id, uid)).returning();
  // keep the denormalized copy in each membership in sync
  if (displayName !== undefined || photoKey !== undefined) {
    await db.update(members).set({ displayName, photoKey }).where(eq(members.userId, uid));
  }
  return c.json(u);
});

// Identity documents are owner-only (issue #7 §7); no route exposes them to house admins.
meApp.get('/documents', async (c) =>
  c.json(await c.var.db.select().from(userDocuments).where(eq(userDocuments.userId, c.var.uid)).orderBy(desc(userDocuments.uploadedAt)).limit(50)),
);

const doc = z.object({
  id: z.uuid().optional(),
  type: z.enum(['PASSPORT', 'NATIONAL_ID']),
  objectKey: z.string().min(1).max(500),
  fileName: z.string().min(1).max(255),
  mimeType: z.enum(DOC_MIME),
  sizeBytes: z.number().int().min(0).max(MAX_BYTES.document),
});

meApp.post('/documents', async (c) => {
  const b = await readBody(c, doc);
  if (b.res) return b.res;
  const p = parseKey(b.data.objectKey);
  if (p?.kind !== 'document' || p.owner !== c.var.uid) return c.json({ error: 'invalid_object_key' }, 400); // only your own documents folder
  if ((await c.env.BUCKET.head(b.data.objectKey))?.size !== b.data.sizeBytes) return c.json({ error: 'invalid_object' }, 400); // upload first
  const [d] = await c.var.db.insert(userDocuments).values({ ...b.data, userId: c.var.uid }).returning();
  return c.json(d, 201);
});

meApp.delete('/documents/:id', uuidParam('id'), async (c) => {
  const rows = await c.var.db.delete(userDocuments).where(and(eq(userDocuments.id, c.req.param('id')), eq(userDocuments.userId, c.var.uid))).returning();
  if (!rows.length) return notFound(c);
  await deleteObjects(c.env.BUCKET, [rows[0]!.objectKey]);
  return c.body(null, 204);
});
