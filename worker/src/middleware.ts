import { and, eq } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { z } from 'zod';

import { createAuth } from './auth';
import { createDb, type Db } from './db/client';
import { members } from './db/schema';
import type { Env } from './index';

export type AppEnv = { Bindings: Env; Variables: { db: Db; uid: string } };
// Authentication: every route below needs a Better Auth session (Bearer token or cookie).
export const session: MiddlewareHandler<AppEnv> = async (c, next) => {
  const db = createDb(c.env.DATABASE_URL);
  const s = await createAuth(db, c.env).api.getSession({ headers: c.req.raw.headers });
  if (!s) return c.json({ error: 'unauthorized' }, 401);
  c.set('db', db);
  c.set('uid', s.user.id);
  await next();
};
const membership = async (db: Db, houseId: string, uid: string) =>
  (await db.select().from(members).where(and(eq(members.houseId, houseId), eq(members.userId, uid), eq(members.status, 'ACTIVE'))))[0];

// Authorization: loads the caller's active membership; `admin` additionally requires the ADMIN role.
export const guard = (admin: boolean): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    const id = c.req.param('id') ?? '';
    // malformed ids would make Postgres throw on the uuid cast
    if (!z.uuid().safeParse(id).success) return c.json({ error: 'not_found' }, 404);
    const m = await membership(c.var.db, id, c.var.uid);
    if (!m) return c.json({ error: 'not_found' }, 404); // 404, not 403: don't reveal that a house exists
    if (admin && m.role !== 'ADMIN') return c.json({ error: 'forbidden' }, 403);
    await next();
  };

