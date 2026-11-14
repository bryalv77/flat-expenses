/**
 * Drives the real `httpApi` against a running Worker (`cd worker && pnpm dev:local`), so the wire -> domain mapping is
 * checked against real responses. Skipped unless API_E2E_URL is set:  API_E2E_URL=http://localhost:8787 pnpm test apiHttp.e2e
 */
import nodeHttp from 'node:http';

const URL_ = process.env.API_E2E_URL;

// jest-expo swaps `fetch` for a native-backed mock that never reaches the network, so this test brings a tiny real one.
const realFetch = (url: string, init: { method?: string; headers?: Record<string, string>; body?: string | Uint8Array } = {}) =>
  new Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>((resolve, reject) => {
    const req = nodeHttp.request(url, { method: init.method ?? 'GET', headers: init.headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        const status = res.statusCode ?? 0;
        resolve({ ok: status >= 200 && status < 300, status, text: async () => text, json: async () => JSON.parse(text) });
      });
    });
    req.on('error', reject);
    req.end(init.body === undefined ? undefined : Buffer.from(init.body));
  });
const run = Math.random().toString(36).slice(2, 8);

(URL_ ? describe : describe.skip)('httpApi against the Worker', () => {
  let api: typeof import('./db').api;
  let http: typeof import('./http');
  let request: typeof import('./http').request;
  const uid = () => crypto.randomUUID();

  beforeAll(async () => {
    process.env.EXPO_PUBLIC_API_URL = URL_;
    global.fetch = realFetch as unknown as typeof fetch;
    // require, not import(): jest runs CommonJS here, and EXPO_PUBLIC_API_URL must be set before http.ts is first loaded.
    /* eslint-disable @typescript-eslint/no-require-imports */
    http = require('./http');
    request = http.request;
    api = require('./apiHttp').httpApi;
    /* eslint-enable @typescript-eslint/no-require-imports */
    const res = await fetch(`${URL_}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: URL_ as string },
      body: JSON.stringify({ email: `e2e-${run}@test.dev`, password: 'password123', name: 'E2E' }),
    });
    const { token } = (await res.json()) as { token: string };
    http.setApiTokenProvider(async () => token);
  });

  it('runs the app flows with the same signatures and result shapes as the Firestore api', async () => {
    const me = await api.getMe();
    expect(me).toMatchObject({ displayName: 'E2E', accountRole: 'ROOMMATE', locale: 'es' });
    await api.updateMyProfile({ displayName: 'Ana', locale: 'en' });

    const houseId = uid();
    await api.createHouse({ id: houseId, name: 'Piso', splitMode: 'EQUAL' });
    const houses = await api.listMyHouses();
    expect(houses).toEqual([expect.objectContaining({ id: houseId, name: 'Piso', role: 'ADMIN', showBalanceToRoommates: true })]);
    expect((await api.getHouse({ houseId }))?.members[0]).toMatchObject({ id: me!.id, userId: me!.id, displayName: 'Ana', role: 'ADMIN', photoPath: null });
    expect(await api.getHouse({ houseId: uid() })).toBeNull();

    // categories, with a client-chosen id
    const categoryId = uid();
    await api.createCategory({ houseId, id: categoryId, name: 'Luz', icon: 'bolt', color: '#FFAA00', amountType: 'VARIABLE', intervalUnit: 'MONTH', intervalCount: 1, anchorDate: '2026-01-01' });
    expect(await api.listCategories({ houseId })).toEqual([expect.objectContaining({ id: categoryId, name: 'Luz', expectedAmountCents: null, isActive: true })]);
    await api.archiveCategory({ houseId, id: categoryId, isActive: false });

    // bills with an uploaded file: storagePath <-> objectKey
    const billId = uid();
    const key = `houses/${houseId}/bills/${billId}/inv.png`;
    const link = await request<{ url: string }>('POST', '/api/files/sign', { key }); // signing needs no object, but proves auth + key rules
    expect(link.url).toContain(`/api/files/${key}?exp=`);
    const body = new Uint8Array(64);
    const up = await fetch(`${URL_}/api/files/${key}`, { method: 'PUT', headers: { 'content-type': 'image/png', ...(await http.authHeader()) }, body });
    expect(up.status).toBe(201);
    await api.createBill({ houseId, id: billId, categoryId, amountCents: 5000, chargeDate: '2026-03-15', files: [{ storagePath: key, fileName: 'inv.png', mimeType: 'image/png', sizeBytes: 64 }] });
    const bill = await api.getBill({ houseId, id: billId });
    expect(bill).toMatchObject({ id: billId, amountCents: 5000, chargeDate: '2026-03-15', notes: null, files: [{ storagePath: key, fileName: 'inv.png', sizeBytes: 64 }] });
    expect(await api.listBills({ houseId, from: '2026-03-01', to: '2026-03-31', categoryId })).toHaveLength(1);
    await expect(api.deleteCategory({ houseId, id: categoryId })).rejects.toThrow('CATEGORY_HAS_BILLS');
    const signed = (await request<{ url: string }>('POST', '/api/files/sign', { key })).url;
    expect((await fetch(signed)).status).toBe(200); // <Image> style: no Authorization header
    await api.updateBill({ houseId, id: billId, files: [] });
    expect((await fetch(signed)).status).toBe(404); // dropped from the bill => object deleted

    // invites and members
    const code = 'K7QXM' + 'A'.repeat(3);
    await api.createInvite({ houseId, code, expiresAt: new Date(Date.now() + 864e5).toISOString(), maxUses: 2 });
    expect(await api.listInvites({ houseId })).toEqual([expect.objectContaining({ id: code, code, status: 'ACTIVE', usedCount: 0, maxUses: 2 })]);
    await expect(api.redeemInvite({ code })).rejects.toThrow('Already a member'); // we are the admin
    await expect(api.redeemInvite({ code: 'ZZZZZZZZ' })).rejects.toThrow('Invalid invite code');
    await api.revokeInvite({ houseId, inviteId: code });
    const guestId = 'guest_' + uid().replace(/-/g, '');
    await api.createGuestMember({ houseId, id: guestId, displayName: 'Bea', joinedAt: '2026-01-01', removedAt: null, individualContributionCents: null });
    await api.removeMember({ houseId, memberId: guestId, removedAt: '2026-06-30' });
    await api.setMemberContribution({ houseId, memberId: guestId, individualContributionCents: 1234 });
    expect((await api.listMembers({ houseId })).find((m) => m.id === guestId)).toMatchObject({ status: 'REMOVED', removedAt: '2026-06-30T12:00:00.000Z', individualContributionCents: 1234, email: '' });

    // payments
    const paymentId = uid();
    await api.recordPayment({ houseId, id: paymentId, memberId: guestId, month: '2026-03-01', amountCents: 100 });
    expect(await api.listPayments({ houseId, from: '2026-01-01', to: '2026-12-01' })).toEqual([expect.objectContaining({ id: paymentId, memberId: guestId, note: null })]);
    await api.deletePayment({ houseId, id: paymentId });

    // account deletion goes through Better Auth, so the data-layer entry point refuses instead of silently doing nothing
    await expect(api.deleteMyAccountData()).rejects.toThrow('USE_AUTH_DELETE_USER');
    await api.deleteHouse({ houseId });
    expect(await api.listMyHouses()).toEqual([]);
  });
});
