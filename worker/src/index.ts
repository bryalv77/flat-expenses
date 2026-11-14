import { Hono } from 'hono';

import { createAuth } from './auth';
import { createDb } from './db/client';
import { filesApp } from './files';
import { housesApp } from './houses';
import { invitesApp } from './invites';
import { meApp } from './me';

export interface Env {
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  BUCKET: R2Bucket;
}

export const app = new Hono<{ Bindings: Env }>();

// Client-chosen ids can collide: a Postgres unique violation (23505, possibly wrapped by drizzle) is a 409, not a 500.
const isUniqueViolation = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && ((e as { code?: string }).code === '23505' || isUniqueViolation((e as { cause?: unknown }).cause));
app.onError((e, c) => {
  if (isUniqueViolation(e)) return c.json({ error: 'conflict' }, 409);
  console.error(e);
  return c.json({ error: 'internal' }, 500);
});

app.get('/health', (c) => c.json({ ok: true }));

app.on(['GET', 'POST'], '/api/auth/*', (c) => createAuth(createDb(c.env.DATABASE_URL), c.env).handler(c.req.raw));

app.route('/api/houses', housesApp);
app.route('/api/me', meApp);
app.route('/api/invites', invitesApp);
app.route('/api/files', filesApp);

export default app;
