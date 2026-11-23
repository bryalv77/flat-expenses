import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { createAuth } from './auth';
import { WEB_ORIGINS, devWebOrigins } from './config';
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
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  EMAIL_MODE?: string;
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

// The hosted web app calls the Worker from another origin. Auth is by bearer token, but Better Auth's browser client always
// fetches with credentials: 'include', and the browser then blocks any response lacking Allow-Credentials: true (origins are allowlisted). The browser
// can only read `set-auth-token` (how sign-in hands over the session token) when it is exposed explicitly.
app.use('/api/*', (c, next) =>
  cors({
    origin: (origin) => ([...WEB_ORIGINS, ...devWebOrigins(c.env)].includes(origin) ? origin : null),
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['authorization', 'content-type'],
    exposeHeaders: ['set-auth-token'],
    credentials: true,
    maxAge: 86_400,
  })(c, next),
);

app.get('/health', (c) => c.json({ ok: true }));

app.on(['GET', 'POST'], '/api/auth/*', (c) => createAuth(createDb(c.env.DATABASE_URL), c.env, (p) => {
    try {
      c.executionCtx.waitUntil(p);
    } catch {
      void p; // no ExecutionContext (unit tests): just let it run
    }
  }).handler(c.req.raw));

app.route('/api/houses', housesApp);
app.route('/api/me', meApp);
app.route('/api/invites', invitesApp);
app.route('/api/files', filesApp);

export default app;
