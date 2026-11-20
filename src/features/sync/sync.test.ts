import { createLocalApi } from '@/lib/api/local';
import { createTestDb } from '@/lib/api/local/testDb';
import { migrate } from '@/lib/api/local/migrate';
import type { Api } from '@/lib/api/types';

import { computeSyncDecision, readLocalHouses, uploadLocalToCloud, type LocalHouseData } from './sync';

const UID = 'cloud-user-1';

/** Records the cloud API calls made during an upload. */
function makeFakeCloud() {
  const calls: { method: string; args: unknown }[] = [];
  const rec = (method: string) => (args: unknown) => {
    calls.push({ method, args });
    return Promise.resolve();
  };
  const cloud = {
    createHouse: rec('createHouse'),
    setMemberContribution: rec('setMemberContribution'),
    createGuestMember: rec('createGuestMember'),
    createCategory: rec('createCategory'),
    createBill: rec('createBill'),
    recordPayment: rec('recordPayment'),
  } as unknown as Api;
  return { cloud, calls };
}

async function seedLocalHouse() {
  const db = createTestDb();
  await migrate(db);
  const local = createLocalApi(db, { userId: 'local', now: () => '2026-01-15T12:00:00.000Z' });
  const houseId = 'house-A';
  const guestId = 'guest_ABCDEF123456';
  await local.createHouse({ id: houseId, name: 'Piso A', address: 'Calle 1', splitMode: 'EQUAL' });
  await local.createGuestMember({ houseId, id: guestId, displayName: 'Guest', joinedAt: '2025-06-01', removedAt: null, individualContributionCents: 50000 });
  await local.createCategory({ houseId, id: 'cat-1', name: 'Luz', icon: 'bolt', color: '#000000', amountType: 'VARIABLE', expectedAmountCents: null, intervalUnit: 'MONTH', intervalCount: 1, anchorDate: '2026-01-01', isActive: true, sortOrder: 0, notes: null });
  await local.createBill({ houseId, id: 'bill-1', categoryId: 'cat-1', amountCents: 12000, chargeDate: '2026-01-10', files: [{ storagePath: `houses/${houseId}/bills/bill-1/factura.pdf`, fileName: 'factura.pdf', mimeType: 'application/pdf', sizeBytes: 100 }] });
  await local.recordPayment({ houseId, id: 'pay-1', memberId: 'local', month: '2026-01-01', amountCents: 12000 });
  await local.recordPayment({ houseId, id: 'pay-2', memberId: guestId, month: '2026-01-01', amountCents: 5000 });
  return { local };
}

describe('computeSyncDecision', () => {
  it('nothing when local is empty', () => expect(computeSyncDecision(0, 3)).toEqual({ kind: 'nothing' }));
  it('upload when cloud is empty', () => expect(computeSyncDecision(2, 0)).toEqual({ kind: 'upload', localCount: 2 }));
  it('choose when both have data', () => expect(computeSyncDecision(2, 1)).toEqual({ kind: 'choose', localCount: 2 }));
});

describe('uploadLocalToCloud', () => {
  it('additively uploads local houses, maps the local admin to the cloud user, and skips existing houses', async () => {
    const { local } = await seedLocalHouse();
    const snapshot: LocalHouseData[] = await readLocalHouses(local);
    const { cloud, calls } = makeFakeCloud();
    const uploadedPaths: string[] = [];

    const count = await uploadLocalToCloud(
      {
        cloud,
        uid: UID,
        localFileUrl: async (p) => `file:///local/${p}`,
        uploadFile: async (p) => void uploadedPaths.push(p),
      },
      snapshot,
      new Set(['cloud-existing']),
    );

    expect(count).toBe(1);
    expect(calls.find((c) => c.method === 'createHouse')).toEqual({ method: 'createHouse', args: { id: 'house-A', name: 'Piso A', address: 'Calle 1', splitMode: 'EQUAL', showBalanceToRoommates: true } });
    expect(calls.find((c) => c.method === 'createGuestMember')).toEqual({
      method: 'createGuestMember',
      args: { houseId: 'house-A', id: 'guest_ABCDEF123456', displayName: 'Guest', joinedAt: '2025-06-01', removedAt: null, individualContributionCents: 50000 },
    });
    expect(calls.find((c) => c.method === 'createCategory')).toEqual({ method: 'createCategory', args: expect.objectContaining({ houseId: 'house-A', id: 'cat-1', name: 'Luz' }) });
    expect(uploadedPaths).toEqual(['houses/house-A/bills/bill-1/factura.pdf']);
    const bill = calls.find((c) => c.method === 'createBill');
    expect(bill).toEqual({ method: 'createBill', args: expect.objectContaining({ houseId: 'house-A', id: 'bill-1', files: [{ storagePath: 'houses/house-A/bills/bill-1/factura.pdf', fileName: 'factura.pdf', mimeType: 'application/pdf', sizeBytes: 100 }] }) });
    const payments = calls.filter((c) => c.method === 'recordPayment').map((c) => c.args as { memberId: string });
    expect(payments.map((p) => p.memberId).sort()).toEqual(['cloud-user-1', 'guest_ABCDEF123456']);
  });

  it('skips houses that already exist in the cloud', async () => {
    const { local } = await seedLocalHouse();
    const snapshot = await readLocalHouses(local);
    const { cloud, calls } = makeFakeCloud();
    const count = await uploadLocalToCloud(
      { cloud, uid: UID, localFileUrl: async (p) => p, uploadFile: async () => undefined },
      snapshot,
      new Set(['house-A']),
    );
    expect(count).toBe(0);
    expect(calls).toEqual([]);
  });
});
