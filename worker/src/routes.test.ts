import { afterEach, beforeAll, describe, expect, inject, it, vi } from 'vitest';

import { createDb } from './db/client';
import { account, members } from './db/schema';
import { app } from './index';
import { and, eq } from 'drizzle-orm';

const dbUrl = inject('testDbUrl');
// Minimal in-memory R2: just what the Worker calls (put/get/head/delete/list).
const store = new Map<string, { data: ArrayBuffer; contentType?: string }>();
const bucket = {
  put: async (key: string, data: ArrayBuffer, o?: { httpMetadata?: { contentType?: string } }) => void store.set(key, { data, contentType: o?.httpMetadata?.contentType }),
  head: async (key: string) => (store.has(key) ? { size: store.get(key)!.data.byteLength } : null),
  get: async (key: string) => {
    const o = store.get(key);
    return o && { body: new Response(o.data).body, size: o.data.byteLength, httpMetadata: { contentType: o.contentType } };
  },
  delete: async (keys: string | string[]) => void [keys].flat().forEach((k) => store.delete(k)),
  list: async ({ prefix = '' }: { prefix?: string }) => ({ objects: [...store.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })), truncated: false }),
} as unknown as R2Bucket;

const env: Record<string, unknown> = { EMAIL_MODE: 'log', BUCKET: bucket, DATABASE_URL: dbUrl ?? '', BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-00', BETTER_AUTH_URL: 'http://localhost' };
const run = Math.random().toString(36).slice(2, 8); // unique emails: the test DB is never wiped

type Res = { status: number; body: any };
const call = async (method: string, path: string, token?: string, body?: unknown): Promise<Res> => {
  const res = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json', origin: 'http://localhost', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }, env);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

const upload = async (key: string, token: string, bytes = 100, type = 'image/png') => {
  const res = await app.request(`/api/files/${key}`, { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': type }, body: new Uint8Array(bytes) }, env);
  return res.status;
};
const download = (key: string, token: string) => app.request(`/api/files/${key}`, { headers: { authorization: `Bearer ${token}` } }, env);

const signUp = async (name: string) => {
  const email = `${name}-${run}@test.dev`;
  const r = await call('POST', '/api/auth/sign-up/email', undefined, { email, password: 'password123', name });
  expect(r.status).toBe(200);
  const token: string = r.body.token;
  const me = await call('GET', '/api/me', token);
  return { token, id: me.body.id as string };
};

const day = (offset = 7) => new Date(Date.now() + offset * 864e5).toISOString();
const catBody = { name: 'Luz', icon: 'bolt', color: '#FFAA00', amountType: 'VARIABLE', intervalUnit: 'MONTH', intervalCount: 1, anchorDate: '2026-01-01' };

describe.skipIf(!dbUrl)('API routes (real Postgres)', () => {
  let admin: Awaited<ReturnType<typeof signUp>>, roomie: typeof admin, outsider: typeof admin;
  let house: string, cat: string;

  beforeAll(async () => {
    [admin, roomie, outsider] = await Promise.all([signUp('admin'), signUp('roomie'), signUp('outsider')]);
    house = (await call('POST', '/api/houses', admin.token, { name: 'Piso' })).body.id;
    const invite = (await call('POST', `/api/houses/${house}/invites`, admin.token, { expiresAt: day(), maxUses: 5 })).body.code;
    expect((await call('POST', '/api/invites/redeem', roomie.token, { code: invite })).status).toBe(200);
    cat = (await call('POST', `/api/houses/${house}/categories`, admin.token, catBody)).body.id;
  });

  it('houses: members see them, outsiders get 404, only admins write', async () => {
    expect((await call('GET', `/api/houses/${house}`, roomie.token)).status).toBe(200);
    expect((await call('GET', `/api/houses/${house}`, outsider.token)).status).toBe(404);
    expect((await call('GET', '/api/houses', outsider.token)).body).toEqual([]);
    expect((await call('PATCH', `/api/houses/${house}`, roomie.token, { name: 'x' })).status).toBe(403);
    expect((await call('PATCH', `/api/houses/${house}`, outsider.token, { name: 'x' })).status).toBe(404);
    expect((await call('PATCH', `/api/houses/${house}`, admin.token, { bogus: 1 })).status).toBe(400);
    expect((await call('GET', '/api/houses/not-a-uuid', admin.token)).status).toBe(404);
  });

  it('members: guests, removal with a past date, reactivation, last admin cannot leave', async () => {
    const m = `/api/houses/${house}/members`;
    const guest = (await call('POST', `${m}/guests`, admin.token, { displayName: 'Bea', joinedAt: '2026-01-01', removedAt: null, individualContributionCents: null })).body;
    expect(guest.userId).toMatch(/^guest_/);
    const removed = (await call('POST', `${m}/${guest.userId}/remove`, admin.token, { removedAt: '2026-06-30' })).body;
    expect([removed.status, removed.removedAt]).toEqual(['REMOVED', '2026-06-30T12:00:00.000Z']);
    expect((await call('POST', `${m}/${guest.userId}/reactivate`, admin.token)).body.status).toBe('ACTIVE');
    expect((await call('POST', `${m}/guests`, roomie.token, { displayName: 'z', joinedAt: '2026-01-01', removedAt: null, individualContributionCents: null })).status).toBe(403);
    expect((await call('POST', `/api/houses/${house}/leave`, admin.token)).body).toEqual({ error: 'last_admin' });
  });

  it('invites: single use, no double redeem, revoke, removed members can rejoin', async () => {
    const mk = async (maxUses: number) => (await call('POST', `/api/houses/${house}/invites`, admin.token, { expiresAt: day(), maxUses })).body.code as string;
    expect((await call('POST', `/api/houses/${house}/invites`, admin.token, { expiresAt: '2020-01-01T00:00:00Z', maxUses: 1 })).status).toBe(400);
    expect((await call('GET', `/api/houses/${house}/invites`, roomie.token)).status).toBe(403);
    const once = await mk(1);
    expect((await call('POST', '/api/invites/redeem', roomie.token, { code: once })).status).toBe(409); // already a member, no use burned
    const [a, b] = await Promise.all([call('POST', '/api/invites/redeem', (await signUp('racer1')).token, { code: once }), call('POST', '/api/invites/redeem', (await signUp('racer2')).token, { code: once })]);
    expect([a.status, b.status].sort()).toEqual([200, 410]); // exactly one wins the single use
    const revoked = await mk(3);
    await call('POST', `/api/houses/${house}/invites/${revoked}/revoke`, admin.token);
    expect((await call('POST', '/api/invites/redeem', (await signUp('x')).token, { code: revoked })).status).toBe(410);
    expect((await call('POST', '/api/invites/redeem', roomie.token, { code: 'AAAAAAAA' })).status).toBe(404);
    // removed -> redeem again -> active
    await call('POST', `/api/houses/${house}/members/${roomie.id}/remove`, admin.token, {});
    expect((await call('GET', '/api/houses', roomie.token)).body).toEqual([]);
    expect((await call('POST', '/api/invites/redeem', roomie.token, { code: await mk(2) })).status).toBe(200);
    expect((await call('GET', '/api/houses', roomie.token)).body).toHaveLength(1);
  });

  it('categories: validation, admin-only writes, delete blocked by bills', async () => {
    const c = `/api/houses/${house}/categories`;
    expect((await call('POST', c, admin.token, { ...catBody, amountType: 'FIXED' })).status).toBe(400); // FIXED needs an amount
    expect((await call('POST', c, admin.token, { ...catBody, color: 'red' })).status).toBe(400);
    expect((await call('POST', c, roomie.token, catBody)).status).toBe(403);
    expect((await call('GET', c, outsider.token)).status).toBe(404);
    expect((await call('PATCH', `${c}/${cat}`, admin.token, { amountType: 'FIXED' })).status).toBe(400); // merged state invalid
    const bill = (await call('POST', `/api/houses/${house}/bills`, admin.token, { categoryId: cat, amountCents: 100 })).body.id;
    expect((await call('DELETE', `${c}/${cat}`, admin.token)).body).toEqual({ error: 'CATEGORY_HAS_BILLS' });
    await call('DELETE', `/api/houses/${house}/bills/${bill}`, admin.token);
    const spare = (await call('POST', c, admin.token, catBody)).body.id;
    expect((await call('DELETE', `${c}/${spare}`, admin.token)).status).toBe(204);
  });

  it('bills: effective date rule, cross-house category rejected, range filter', async () => {
    const b = `/api/houses/${house}/bills`;
    const charge = (await call('POST', b, admin.token, { categoryId: cat, amountCents: 5000, chargeDate: '2026-03-15' })).body;
    const period = (await call('POST', b, admin.token, { categoryId: cat, amountCents: 7000, periodStartDate: '2026-01-01', periodEndDate: '2026-02-10' })).body;
    expect([charge.effectiveDate, period.effectiveDate]).toEqual(['2026-03-15', '2026-02-10']);
    const patched = (await call('PATCH', `${b}/${charge.id}`, admin.token, { chargeDate: null, periodEndDate: '2026-04-30' })).body;
    expect(patched.effectiveDate).toBe('2026-04-30'); // generated column follows the inputs
    expect((await call('GET', `${b}?from=2026-02-01&to=2026-02-28`, roomie.token)).body.map((x: any) => x.id)).toEqual([period.id]);
    expect((await call('GET', b, roomie.token)).status).toBe(400); // range required
    const otherHouse = (await call('POST', '/api/houses', outsider.token, { name: 'Otro' })).body.id;
    const foreignCat = (await call('POST', `/api/houses/${otherHouse}/categories`, outsider.token, catBody)).body.id;
    expect((await call('POST', b, admin.token, { categoryId: foreignCat, amountCents: 1 })).body).toEqual({ error: 'invalid_category' });
    expect((await call('POST', b, admin.token, { categoryId: cat, amountCents: 0 })).status).toBe(400);
    expect((await call('POST', b, roomie.token, { categoryId: cat, amountCents: 1 })).status).toBe(403);
    expect((await call('DELETE', `/api/houses/${otherHouse}/bills/${period.id}`, outsider.token)).status).toBe(404);
  });

  it('payments: validation, member must belong to the house, immutable, admin-only', async () => {
    const p = `/api/houses/${house}/payments`;
    const ok = { memberId: roomie.id, month: '2026-03-01', amountCents: 25000, note: 'bizum' };
    const paid = (await call('POST', p, admin.token, ok)).body;
    expect((await call('POST', p, admin.token, { ...ok, month: '2026-03-15' })).status).toBe(400);
    expect((await call('POST', p, admin.token, { ...ok, amountCents: 0 })).status).toBe(400);
    expect((await call('POST', p, admin.token, { ...ok, recordedBy: 'x' })).status).toBe(400);
    expect((await call('POST', p, admin.token, { ...ok, memberId: (await signUp('stranger')).id })).body).toEqual({ error: 'invalid_member' });
    expect((await call('POST', p, roomie.token, ok)).status).toBe(403);
    expect((await call('GET', `${p}?from=2026-03-01&to=2026-03-01`, roomie.token)).body).toHaveLength(1);
    expect((await call('GET', `${p}?from=2026-03-15&to=2026-04-01`, roomie.token)).status).toBe(400);
    expect((await call('DELETE', `${p}/${paid.id}`, roomie.token)).status).toBe(403);
    expect((await call('DELETE', `${p}/${paid.id}`, admin.token)).status).toBe(204);
    expect((await call('DELETE', `${p}/${paid.id}`, admin.token)).status).toBe(404);
  });

  it('me: profile syncs to memberships, documents are owner-only', async () => {
    await call('PATCH', '/api/me', admin.token, { displayName: 'Ana B' });
    const members = (await call('GET', `/api/houses/${house}/members`, admin.token)).body;
    expect(members.find((m: any) => m.userId === admin.id).displayName).toBe('Ana B');
    await upload(`users/${admin.id}/documents/d0/p.pdf`, admin.token, 5, 'application/pdf');
    const doc = (await call('POST', '/api/me/documents', admin.token, { type: 'PASSPORT', objectKey: `users/${admin.id}/documents/d0/p.pdf`, fileName: 'p.pdf', mimeType: 'application/pdf', sizeBytes: 5 })).body;
    expect((await call('GET', '/api/me/documents', roomie.token)).body).toEqual([]);
    expect((await call('DELETE', `/api/me/documents/${doc.id}`, roomie.token)).status).toBe(404);
    expect((await call('DELETE', `/api/me/documents/${doc.id}`, admin.token)).status).toBe(204);
  });

  it('files: R2 rules mirror storage.rules (avatar / identity documents / bill files)', async () => {
    const me = admin.id, f = (k: string) => k;
    // avatars: owner writes images < 2 MB, any signed-in user reads
    expect(await upload(f(`users/${me}/avatar/a.png`), admin.token)).toBe(201);
    expect(await upload(f(`users/${me}/avatar/a.png`), roomie.token)).toBe(403);
    expect(await upload(f(`users/${me}/avatar/b.pdf`), admin.token, 100, 'application/pdf')).toBe(415);
    expect(await upload(f(`users/${me}/avatar/big.png`), admin.token, 2 * 1024 * 1024 + 1)).toBe(413);
    expect((await download(`users/${me}/avatar/a.png`, outsider.token)).status).toBe(200);
    // identity documents: owner only, even for reads
    expect(await upload(`users/${me}/documents/d1/id.pdf`, admin.token, 50, 'application/pdf')).toBe(201);
    expect((await download(`users/${me}/documents/d1/id.pdf`, roomie.token)).status).toBe(403);
    const res = await download(`users/${me}/documents/d1/id.pdf`, admin.token);
    expect([res.status, res.headers.get('content-type'), res.headers.get('x-content-type-options'), (await res.arrayBuffer()).byteLength]).toEqual([200, 'application/pdf', 'nosniff', 50]);
    // bill files: members read, admins write, outsiders see nothing
    const bk = `houses/${house}/bills/f1/inv.png`;
    expect(await upload(bk, roomie.token)).toBe(403);
    expect(await upload(bk, outsider.token)).toBe(404);
    expect(await upload(bk, admin.token)).toBe(201);
    expect((await download(bk, roomie.token)).status).toBe(200);
    expect((await download(bk, outsider.token)).status).toBe(404);
    // keys that don't match the convention or try to escape it
    expect(await upload(`houses/${house}/bills/f1/..`, admin.token)).toBe(400);
    expect(await upload(`houses/${house}/other/x.png`, admin.token)).toBe(400);
    expect(await upload(bk, admin.token, 0)).toBe(400);
  });

  it('bills + files: referenced objects are validated; replace, bill delete and house delete clean R2', async () => {
    const b = `/api/houses/${house}/bills`;
    const key = (n: string) => `houses/${house}/bills/f2/${n}`;
    const file = (n: string, size = 100) => ({ objectKey: key(n), fileName: n, mimeType: 'image/png', sizeBytes: size });
    await upload(key('a.png'), admin.token); await upload(key('b.png'), admin.token);

    expect((await call('POST', b, admin.token, { categoryId: cat, amountCents: 1, files: [file('missing.png')] })).body).toEqual({ error: 'invalid_files' });
    expect((await call('POST', b, admin.token, { categoryId: cat, amountCents: 1, files: [file('a.png', 999)] })).status).toBe(400); // size differs from R2
    expect((await call('POST', b, admin.token, { categoryId: cat, amountCents: 1, files: [{ ...file('a.png'), objectKey: `houses/${crypto.randomUUID()}/bills/f/a.png` }] })).status).toBe(400); // other house
    expect((await call('POST', b, admin.token, { categoryId: cat, amountCents: 1, files: [file('a.png'), file('a.png')] })).status).toBe(400); // duplicate

    const bill = (await call('POST', b, admin.token, { categoryId: cat, amountCents: 1, files: [file('a.png'), file('b.png')] })).body;
    expect(bill.files.map((x: any) => x.fileName)).toEqual(['a.png', 'b.png']);
    expect((await call('GET', `${b}/${bill.id}`, roomie.token)).body.files).toHaveLength(2);
    expect((await call('GET', `${b}?from=2000-01-01&to=2100-01-01`, roomie.token)).body.find((x: any) => x.id === bill.id).files).toHaveLength(2);

    // replacing the set drops (and deletes) the objects that are no longer referenced
    const patched = (await call('PATCH', `${b}/${bill.id}`, admin.token, { files: [file('b.png')] })).body;
    expect(patched.files.map((x: any) => x.fileName)).toEqual(['b.png']);
    expect([store.has(key('a.png')), store.has(key('b.png'))]).toEqual([false, true]);
    expect((await call('PATCH', `${b}/${bill.id}`, admin.token, { notes: 'n' })).body.files).toHaveLength(1); // other edits keep files

    // deleting the bill deletes its objects
    expect((await call('DELETE', `${b}/${bill.id}`, admin.token)).status).toBe(204);
    expect(store.has(key('b.png'))).toBe(false);

    // deleting the house purges everything under houses/{id}/
    const h2 = (await call('POST', '/api/houses', outsider.token, { name: 'Temp' })).body.id;
    await upload(`houses/${h2}/bills/f/x.png`, outsider.token);
    expect((await call('DELETE', `/api/houses/${h2}`, outsider.token)).status).toBe(204);
    expect(store.has(`houses/${h2}/bills/f/x.png`)).toBe(false);
  });

  it('me + files: avatar key must be your own, document rows need an uploaded object and are cleaned on delete', async () => {
    const mine = `users/${admin.id}/avatar/a.png`;
    expect((await call('PATCH', '/api/me', admin.token, { photoKey: `users/${roomie.id}/avatar/a.png` })).status).toBe(400);
    expect((await call('PATCH', '/api/me', admin.token, { photoKey: mine })).body.photoKey).toBe(mine);
    const okey = `users/${admin.id}/documents/d9/p.pdf`;
    const row = { type: 'PASSPORT', objectKey: okey, fileName: 'p.pdf', mimeType: 'application/pdf', sizeBytes: 10 };
    expect((await call('POST', '/api/me/documents', admin.token, row)).status).toBe(400); // not uploaded yet
    await upload(okey, admin.token, 10, 'application/pdf');
    expect((await call('POST', '/api/me/documents', admin.token, { ...row, objectKey: `users/${roomie.id}/documents/d9/p.pdf` })).status).toBe(400); // not your folder
    const d = (await call('POST', '/api/me/documents', admin.token, row)).body;
    expect((await call('DELETE', `/api/me/documents/${d.id}`, admin.token)).status).toBe(204);
    expect(store.has(okey)).toBe(false);
  });

  it('ids: the app can choose ids and invite codes (optimistic updates), and bad ones are rejected', async () => {
    const id = crypto.randomUUID();
    const h = await call('POST', '/api/houses', admin.token, { id, name: 'Con id' });
    expect([h.status, h.body.id]).toEqual([201, id]);
    expect((await call('POST', '/api/houses', admin.token, { id, name: 'Dup' })).status).toBeGreaterThanOrEqual(400); // same id twice
    const cid = crypto.randomUUID(), bid = crypto.randomUUID(), pid = crypto.randomUUID();
    expect((await call('POST', `/api/houses/${id}/categories`, admin.token, { ...catBody, id: cid })).body.id).toBe(cid);
    expect((await call('POST', `/api/houses/${id}/bills`, admin.token, { categoryId: cid, amountCents: 1, id: bid })).body.id).toBe(bid);
    expect((await call('POST', `/api/houses/${id}/payments`, admin.token, { id: pid, memberId: admin.id, month: '2026-01-01', amountCents: 1 })).body.id).toBe(pid);
    const gid = 'guest_' + 'ab'.repeat(16);
    expect((await call('POST', `/api/houses/${id}/members/guests`, admin.token, { id: gid, displayName: 'G', joinedAt: '2026-01-01', removedAt: null, individualContributionCents: null })).body.userId).toBe(gid);
    expect((await call('POST', `/api/houses/${id}/members/guests`, admin.token, { id: 'guest_x', displayName: 'G', joinedAt: '2026-01-01', removedAt: null, individualContributionCents: null })).status).toBe(400);
    const code = Array.from({ length: 8 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)]).join(''); // unique per run: the test DB persists
    const inv = (id2: string) => call('POST', `/api/houses/${id2}/invites`, admin.token, { code, expiresAt: day(), maxUses: 1 });
    expect((await inv(id)).body.code).toBe(code);
    expect((await inv(id)).status).toBe(409); // collision: the app retries with another code
    expect((await call('POST', `/api/houses/${id}/invites`, admin.token, { code: 'lowercas', expiresAt: day(), maxUses: 1 })).status).toBe(400);
  });

  it('signed file links: work without a token until they expire, only for what the signer may read', async () => {
    const key = `houses/${house}/bills/s1/inv.png`;
    await upload(key, admin.token);
    expect((await call('POST', '/api/files/sign', outsider.token, { key })).status).toBe(404);
    expect((await call('POST', '/api/files/sign', admin.token, { key: 'nope' })).status).toBe(400);
    const { url } = (await call('POST', '/api/files/sign', roomie.token, { key })).body;
    const path = new URL(url).pathname + new URL(url).search;
    const get = (p: string) => app.request(p, {}, env); // no Authorization header, like <Image>
    expect((await get(path)).status).toBe(200);
    expect((await get(path.replace(/sig=./, (m) => m + (m.endsWith('0') ? '1' : '0')))).status).toBe(403); // tampered signature
    expect((await get(path.replace(/exp=\d+/, 'exp=1'))).status).toBe(403); // expired
    expect((await get(`/api/files/houses/${house}/bills/s1/other.png${new URL(url).search}`)).status).toBe(403); // signature is bound to the key
    expect((await get(`/api/files/${key}`)).status).toBe(401); // no signature, no token
  });

  it('account deletion: blocked for a last admin, wrong password changes nothing, then data is cleaned and history kept', async () => {
    const leaver = await signUp('leaver'), keeper = await signUp('keeper');
    const del = (token: string, password = 'password123') => call('POST', '/api/auth/delete-user', token, { password });
    const mine = (await call('POST', '/api/houses', leaver.token, { name: 'Mi piso' })).body.id;

    const blocked = await del(leaver.token);
    expect([blocked.status, blocked.body.code]).toEqual([409, 'LAST_ADMIN']); // would orphan "Mi piso"

    // keeper joins as roommate and is promoted (no promote route yet), so the leaver is no longer the last admin
    const code = (await call('POST', `/api/houses/${mine}/invites`, leaver.token, { expiresAt: day(), maxUses: 1 })).body.code;
    await call('POST', '/api/invites/redeem', keeper.token, { code });
    const db = createDb(dbUrl!);
    await db.update(members).set({ role: 'ADMIN' }).where(and(eq(members.houseId, mine), eq(members.userId, keeper.id)));

    // the leaver is also a plain roommate in the keeper's own house
    const theirs = (await call('POST', '/api/houses', keeper.token, { name: 'Otro piso' })).body.id;
    const code2 = (await call('POST', `/api/houses/${theirs}/invites`, keeper.token, { expiresAt: day(), maxUses: 1 })).body.code;
    await call('POST', '/api/invites/redeem', leaver.token, { code: code2 });

    // history the leaver created, plus files and an identity document
    const category = (await call('POST', `/api/houses/${mine}/categories`, leaver.token, catBody)).body.id;
    const bill = (await call('POST', `/api/houses/${mine}/bills`, leaver.token, { categoryId: category, amountCents: 4200 })).body;
    expect(bill.createdBy).toBe(leaver.id);
    const avatar = `users/${leaver.id}/avatar/a.png`, passport = `users/${leaver.id}/documents/d1/p.pdf`;
    await upload(avatar, leaver.token); await upload(passport, leaver.token, 10, 'application/pdf');
    await call('POST', '/api/me/documents', leaver.token, { type: 'PASSPORT', objectKey: passport, fileName: 'p.pdf', mimeType: 'application/pdf', sizeBytes: 10 });

    // wrong password: rejected, nothing touched
    expect((await del(leaver.token, 'not-the-password')).status).toBe(400);
    expect(store.has(avatar) && store.has(passport)).toBe(true);
    expect((await call('GET', '/api/me', leaver.token)).status).toBe(200);

    expect((await del(leaver.token)).status).toBe(200);

    // account, sessions and files are gone
    expect((await call('GET', '/api/me', leaver.token)).status).toBe(401);
    expect((await call('POST', '/api/auth/sign-in/email', undefined, { email: `leaver-${run}@test.dev`, password: 'password123' })).status).toBe(401);
    expect([store.has(avatar), store.has(passport)]).toEqual([false, false]);

    // history stays: the bill remains (creator unset), memberships are removed and anonymised
    const kept = (await call('GET', `/api/houses/${mine}/bills/${bill.id}`, keeper.token)).body;
    expect([kept.amountCents, kept.createdBy]).toEqual([4200, null]);
    for (const h of [mine, theirs]) {
      const m = (await call('GET', `/api/houses/${h}/members`, keeper.token)).body.find((x: any) => x.userId === leaver.id);
      expect([m.status, m.displayName, m.email, m.removedAt !== null]).toEqual(['REMOVED', 'Cuenta eliminada', '', true]);
    }
    expect((await call('GET', `/api/houses/${mine}`, keeper.token)).status).toBe(200); // the house survives
  });

  describe('password reset by email', () => {
    const REDIRECT = 'https://app-cuota.devalv.com/reset-password';
    const request = (email: string, e: Record<string, unknown> = env, redirectTo = REDIRECT) =>
      app.request('/api/auth/request-password-reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost' },
        body: JSON.stringify({ email, redirectTo }),
      }, e);
    afterEach(() => vi.restoreAllMocks());

    it('passwords follow the app rule: 6+ characters', async () => {
      const up = (password: string, n: string) => call('POST', '/api/auth/sign-up/email', undefined, { email: `pw-${n}-${run}@test.dev`, password, name: 'Pw' });
      expect((await up('12345', 'a')).status).toBe(400);
      expect((await up('123456', 'b')).status).toBe(200);
    });

    it('log sender: link -> redirect with token -> new password works, old password and old sessions do not', async () => {
      const u = await signUp('forgetful');
      const email = `forgetful-${run}@test.dev`;
      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      expect((await request(email)).status).toBe(200);
      await vi.waitFor(() => expect(log).toHaveBeenCalled());
      const text = String(log.mock.calls[0]![0]);
      expect(text).toContain(`to=${email}`);
      expect(text).toContain('Restablece tu contraseña'); // Spanish: the user's saved locale is the default one
      const link = new URL(text.match(/https?:\/\/\S+/)![0]);

      // the Worker validates the token and sends the browser to the web page with it
      const redirect = await app.request(link.pathname + link.search, {}, env);
      expect(redirect.status).toBe(302);
      const to = new URL(redirect.headers.get('location')!);
      expect([to.origin + to.pathname, to.searchParams.has('token')]).toEqual([REDIRECT, true]);

      const token = to.searchParams.get('token')!;
      const reset = (newPassword: string, t = token) => call('POST', '/api/auth/reset-password', undefined, { newPassword, token: t });
      expect((await reset('brand-new-pass-1')).status).toBe(200);
      expect((await reset('another-pass-2')).status).toBe(400); // the token is single use
      const signIn = (password: string) => call('POST', '/api/auth/sign-in/email', undefined, { email, password });
      expect((await signIn('brand-new-pass-1')).status).toBe(200);
      expect((await signIn('password123')).status).toBe(401);
      expect((await call('GET', '/api/me', u.token)).status).toBe(401); // sessions from before the reset are revoked
    });

    it('unknown email looks the same as a known one and sends nothing; untrusted redirects are refused; bad tokens are rejected', async () => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      expect((await request(`nobody-${run}@test.dev`)).status).toBe(200);
      expect((await request(`forgetful-${run}@test.dev`, env, 'https://evil.example/steal')).status).toBe(403);
      expect((await call('POST', '/api/auth/reset-password', undefined, { newPassword: 'whatever-pass-1', token: 'not-a-token' })).status).toBe(400);
      expect(log).not.toHaveBeenCalled();
    });

    it('Resend: posts the email to the API with the key and from address; English for English users; failures do not break the request', async () => {
      const u = await signUp('english');
      await call('PATCH', '/api/me', u.token, { locale: 'en' });
      const sent: { url: string; init: RequestInit }[] = [];
      vi.stubGlobal('fetch', async (url: string, init: RequestInit) => (sent.push({ url, init }), new Response('{}', { status: 200 })));
      const resend = { ...env, EMAIL_MODE: undefined, RESEND_API_KEY: 're_test_key', EMAIL_FROM: 'Cuota <noreply@example.com>' };
      expect((await request(`english-${run}@test.dev`, resend)).status).toBe(200);
      await vi.waitFor(() => expect(sent).toHaveLength(1));
      const body = JSON.parse(String(sent[0]!.init.body));
      expect([sent[0]!.url, (sent[0]!.init.headers as Record<string, string>).authorization]).toEqual(['https://api.resend.com/emails', 'Bearer re_test_key']);
      expect([body.from, body.to, body.subject]).toEqual(['Cuota <noreply@example.com>', [`english-${run}@test.dev`], 'Reset your Cuota password']);
      expect(body.html).toContain('/api/auth/reset-password/');

      vi.stubGlobal('fetch', async () => new Response('nope', { status: 500 })); // provider down
      const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      expect((await request(`english-${run}@test.dev`, resend)).status).toBe(200);
      await vi.waitFor(() => expect(err).toHaveBeenCalled());
    });

    it('not configured: nothing is sent and the reset link is never logged', async () => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const bare = { ...env, EMAIL_MODE: undefined };
      expect((await request(`forgetful-${run}@test.dev`, bare)).status).toBe(200);
      await vi.waitFor(() => expect(warn).toHaveBeenCalled());
      expect(log).not.toHaveBeenCalled();
      expect(String(warn.mock.calls.flat())).not.toContain('reset-password/');
    });
  });

  describe('CORS for the hosted web app', () => {
    const WEB = 'https://app-cuota.devalv.com';
    const preflight = (path: string, origin: string, method = 'POST') =>
      app.request(path, { method: 'OPTIONS', headers: { origin, 'access-control-request-method': method, 'access-control-request-headers': 'authorization,content-type' } }, env);

    it('answers the preflight for the web origins, with the headers the app sends', async () => {
      for (const origin of [WEB]) {
        const r = await preflight('/api/houses', origin, 'PATCH');
        expect([r.status, r.headers.get('access-control-allow-origin')]).toEqual([204, origin]);
        expect(r.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('authorization');
        expect(r.headers.get('access-control-allow-methods')).toContain('PATCH');
        expect(r.headers.get('access-control-allow-credentials')).toBe('true'); // Better Auth's browser client fetches with credentials: 'include'
      }
    });

    it('gives other origins no CORS headers (the browser then blocks them)', async () => {
      for (const origin of ['https://evil.example', 'https://app-cuota.devalv.com.evil.example']) {
        expect((await preflight('/api/houses', origin)).headers.get('access-control-allow-origin')).toBeNull();
      }
      const prod = { ...env, BETTER_AUTH_URL: 'https://costos-piso-api.bryalv77.workers.dev' };
      const r = await app.request('/api/houses', { method: 'OPTIONS', headers: { origin: 'http://localhost:8081', 'access-control-request-method': 'GET' } }, prod);
      expect(r.headers.get('access-control-allow-origin')).toBeNull(); // a page on someone's localhost can't call production
    });

    it('exposes set-auth-token on sign-in so the browser can read the session token, and works with the web origin as Origin', async () => {
      const email = `cors-${run}@test.dev`;
      const up = await app.request('/api/auth/sign-up/email', { method: 'POST', headers: { 'content-type': 'application/json', origin: WEB }, body: JSON.stringify({ email, password: 'password123', name: 'Cors' }) }, env);
      expect(up.status).toBe(200);
      expect(up.headers.get('access-control-allow-origin')).toBe(WEB);
      expect(up.headers.get('access-control-expose-headers')?.toLowerCase()).toContain('set-auth-token');
      expect(up.headers.get('set-auth-token')).toBeTruthy();
    });

    it('also covers file downloads (signed links are loaded cross-origin by <img>/<iframe>) and errors', async () => {
      const r = await app.request('/api/houses', { headers: { origin: WEB } }, env); // 401 without a session, still with CORS headers
      expect([r.status, r.headers.get('access-control-allow-origin')]).toEqual([401, WEB]);
    });
  });
});
