import { expect, it } from 'vitest';

import { app } from './index';

it('GET /health', async () => {
  const res = await app.request('/health');
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});

const env = { DATABASE_URL: 'postgres://u:p@localhost/db', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'http://localhost' };

it.each(['/api/houses', '/api/me', '/api/me/documents', '/api/houses/x/members', '/api/houses/x/invites', '/api/houses/x/categories', '/api/houses/x/bills', '/api/houses/x/payments'])('%s requires a session', async (path) => {
  expect((await app.request(path, {}, env)).status).toBe(401);
});
