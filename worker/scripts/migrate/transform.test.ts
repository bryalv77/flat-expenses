import { describe, expect, it } from 'vitest';

import { parseKey } from '../../src/files.ts';
import { toUuid, transform, validKey, type Source } from './transform.ts';

const H = '11111111-1111-4111-8111-111111111111', CAT = '22222222-2222-4222-8222-222222222222', BILL = '33333333-3333-4333-8333-333333333333';
const base = (): Source => ({
  authUsers: [
    { uid: 'u1', email: 'Ana@Test.dev', emailVerified: true, displayName: 'Ana', passwordHash: 'HASH', passwordSalt: 'SALT', providers: [{ providerId: 'password', uid: 'ana@test.dev' }], createdAt: '2025-01-01T00:00:00Z' },
    { uid: 'u2', email: 'bob@test.dev', providers: [{ providerId: 'google.com', uid: 'g-123' }], photoURL: 'https://x/y.png' },
  ],
  profiles: { u1: { displayName: 'Ana B', accountRole: 'ADMIN', locale: 'en', photoPath: 'users/u1/avatar/a.jpg', createdAt: '2025-01-02T00:00:00Z' } },
  documents: { u1: [{ id: '44444444-4444-4444-8444-444444444444', type: 'PASSPORT', storagePath: 'users/u1/documents/d/p.pdf', fileName: 'p.pdf', mimeType: 'application/pdf', sizeBytes: 5 }] },
  houses: [{
    id: H, name: 'Piso', createdBy: 'u1', createdAt: '2025-02-01T00:00:00Z',
    members: [
      { id: 'u1', role: 'ADMIN', status: 'ACTIVE', joinedAt: '2025-02-01T00:00:00Z', displayName: 'Ana', email: 'ana@test.dev' },
      { id: 'guest_' + 'a'.repeat(32), role: 'ROOMMATE', status: 'REMOVED', joinedAt: '2025-02-01T00:00:00Z', removedAt: '2025-06-30T12:00:00Z', displayName: 'Bea', email: '' },
    ],
    categories: [{ id: CAT, name: 'Luz', icon: 'bolt', color: '#FFAA00', amountType: 'VARIABLE', intervalUnit: 'MONTH', intervalCount: 1, anchorDate: '2025-01-01', isActive: true, sortOrder: 0 }],
    bills: [{ id: BILL, categoryId: CAT, amountCents: 5000, chargeDate: '2025-03-15', effectiveDate: '2025-03-15', createdBy: 'u1', createdAt: '2025-03-16T10:00:00Z',
      files: [{ storagePath: `houses/${H}/bills/${BILL}/ab-inv.pdf`, fileName: 'inv.pdf', mimeType: 'application/pdf', sizeBytes: 10 }] }],
    payments: [{ id: '55555555-5555-4555-8555-555555555555', memberId: 'u1', month: '2025-03-01', amountCents: 100 }],
  }],
  invites: [{ code: 'K7QXM2PD', houseId: H, status: 'ACTIVE', expiresAt: '2030-01-01T00:00:00Z', maxUses: 2, usedCount: 1, createdBy: 'u1' }],
  objects: { 'users/u1/avatar/a.jpg': 3, 'users/u1/documents/d/p.pdf': 5, [`houses/${H}/bills/${BILL}/ab-inv.pdf`]: 10 },
});

describe('migration transform', () => {
  it('maps a clean export to rows without issues', () => {
    const { plan, issues } = transform(base());
    expect(issues.filter((i) => i.level !== 'warn')).toEqual([]);
    expect(Object.fromEntries(Object.entries(plan).map(([k, v]) => [k, v.length]))).toEqual({ user: 2, account: 2, user_documents: 1, houses: 1, members: 2, categories: 1, bills: 1, payments: 1, invites: 1, files: 3 });
    expect(plan.user[0]).toMatchObject({ id: 'u1', name: 'Ana B', email: 'ana@test.dev', email_verified: true, account_role: 'ADMIN', locale: 'en', photo_key: 'users/u1/avatar/a.jpg' });
    expect(plan.user[1]).toMatchObject({ id: 'u2', name: 'bob', account_role: 'USER', image: 'https://x/y.png' });
    expect(plan.account).toEqual([
      expect.objectContaining({ provider_id: 'credential', account_id: 'u1', password: 'firebase-scrypt$HASH$SALT' }),
      expect.objectContaining({ provider_id: 'google', account_id: 'g-123', user_id: 'u2', password: null }),
    ]);
    expect(plan.bills[0]!.files).toEqual([expect.objectContaining({ object_key: `houses/${H}/bills/${BILL}/ab-inv.pdf`, position: 0 })]);
    expect(plan.houses[0]).toMatchObject({ created_by: 'u1', currency: 'EUR' });
  });

  it('skips and reports users that cannot be migrated', () => {
    const s = base();
    s.authUsers.push({ uid: 'u3', providers: [] }, { uid: 'u4', email: 'ANA@test.dev', providers: [] });
    s.profiles.ghost = { displayName: 'Ghost' };
    const { plan, issues } = transform(s);
    expect(plan.user.map((u) => u.id)).toEqual(['u1', 'u2']);
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ level: 'skip', where: 'auth u3', message: expect.stringContaining('no email') }),
      expect.objectContaining({ level: 'skip', where: 'auth u4', message: expect.stringContaining('duplicate email') }),
      expect.objectContaining({ where: 'profile ghost' }),
    ]));
  });

  it('a password user without an exported hash gets no credential account (they must reset)', () => {
    const s = base();
    delete s.authUsers[0]!.passwordHash;
    const { plan, issues } = transform(s);
    expect(plan.account.map((a) => a.provider_id)).toEqual(['google']);
    expect(issues.some((i) => i.message.includes('must reset'))).toBe(true);
  });

  it('repairs members that break the ACTIVE <=> removed_at rule, and says so', () => {
    const s = base();
    s.houses[0]!.members.push({ id: 'u2', role: 'ROOMMATE', status: 'ACTIVE', joinedAt: '2025-02-02T00:00:00Z', removedAt: '2025-05-01T00:00:00Z' }, { id: 'u1x', role: 'ROOMMATE', status: 'REMOVED', joinedAt: '2025-02-03T00:00:00Z' });
    const { plan, issues } = transform(s);
    expect(plan.members.find((m) => m.user_id === 'u2')).toMatchObject({ status: 'REMOVED', removed_at: '2025-05-01T00:00:00Z' });
    expect(plan.members.find((m) => m.user_id === 'u1x')).toMatchObject({ status: 'REMOVED', removed_at: '2025-02-03T00:00:00Z' });
    expect(issues.filter((i) => i.level === 'fix')).toHaveLength(2);
  });

  it('skips rows Postgres could not hold, without losing the rest', () => {
    const s = base();
    s.houses[0]!.bills.push(
      { id: '66666666-6666-4666-8666-666666666666', categoryId: 'missing', amountCents: 1 },
      { id: '77777777-7777-4777-8777-777777777777', categoryId: CAT, amountCents: 0 },
      { id: '88888888-8888-4888-8888-888888888888', categoryId: CAT, amountCents: 10_000_000 },
    );
    s.houses[0]!.payments.push({ id: '99999999-9999-4999-8999-999999999999', memberId: 'u1', month: '2025-03-15', amountCents: 5 });
    s.invites.push({ code: 'ZZZZZZZZ', houseId: 'a-house-that-does-not-exist' });
    const { plan, issues } = transform(s);
    expect([plan.houses.length, plan.bills.length, plan.payments.length, plan.invites.length]).toEqual([1, 1, 1, 1]);
    expect(issues.filter((i) => i.level === 'skip')).toHaveLength(5);
  });

  it('keeps rows whose Firestore id is not a UUID, with a stable UUID derived from the old id (never skips them)', () => {
    const s = base();
    s.houses[0]!.payments.push({ id: 'AYtyehOLdopSykOm1vzG', memberId: 'u1', month: '2025-04-01', amountCents: 7 }, { id: 'DfsX5lPyynZhY0SMI4Xd', memberId: 'u1', month: '2025-05-01', amountCents: 8 });
    s.houses[0]!.categories.push({ id: 'autoCat1', name: 'Gas', amountType: 'VARIABLE' });
    s.houses[0]!.bills.push({ id: 'autoBill1', categoryId: 'autoCat1', amountCents: 9, createdAt: '2025-04-02T00:00:00Z' });
    const first = transform(s), again = transform(structuredClone(s));
    expect(first.plan.payments).toHaveLength(3);
    expect(first.plan.payments.map((p) => p.id)).toEqual(again.plan.payments.map((p) => p.id)); // deterministic: a re-run hits the same rows
    const cat = first.plan.categories.find((c) => c.name === 'Gas')!, bill = first.plan.bills.find((b) => b.amount_cents === 9)!;
    expect(bill.category_id).toBe(cat.id); // references follow the remapped id
    expect(cat.id).toBe(toUuid('category', 'autoCat1'));
    expect(first.issues.filter((i) => i.level === 'skip')).toEqual([]);
    expect(first.issues.some((i) => i.where === 'payments' && i.message.startsWith('2 id(s)'))).toBe(true); // one summary line, not one per row
    expect(toUuid('payment', 'x')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(toUuid('payment', 'x')).not.toBe(toUuid('bill', 'x')); // the kind is part of the hash
    expect(toUuid('payment', H.toUpperCase())).toBe(H); // real UUIDs are left alone
  });

  it('a house with a non-UUID id moves its files to the new id, and its invites and children follow', () => {
    const s = base();
    const old = 'AutoHouse12345';
    const dir = `houses/${old}/bills/${BILL}`;
    s.houses.push({ id: old, name: 'Viejo', members: [{ id: 'u1', role: 'ADMIN', status: 'ACTIVE' }], categories: [{ id: CAT.replace('2222', '9999'), name: 'X' }],
      bills: [{ id: BILL.replace('3333', '9999'), categoryId: CAT.replace('2222', '9999'), amountCents: 5, files: [{ storagePath: `${dir}/inv.pdf`, mimeType: 'application/pdf', sizeBytes: 4 }] }], payments: [] });
    s.invites.push({ code: 'QQQQQQQQ', houseId: old });
    s.objects[`${dir}/inv.pdf`] = 4;
    const { plan, issues } = transform(s);
    const hid = toUuid('house', old);
    expect(plan.houses.map((h) => h.id)).toContain(hid);
    expect(plan.members.some((m) => m.house_id === hid)).toBe(true);
    expect(plan.invites.find((i) => i.code === 'QQQQQQQQ')!.house_id).toBe(hid);
    expect(plan.bills.find((b) => b.house_id === hid)!.files[0]).toMatchObject({ object_key: `houses/${hid}/bills/${BILL}/inv.pdf` });
    expect(plan.files.find((f) => f.from === `${dir}/inv.pdf`)).toMatchObject({ key: `houses/${hid}/bills/${BILL}/inv.pdf` });
    expect(issues.some((i) => i.level === 'fix' && i.where === `house ${old}`)).toBe(true);
  });

  it('uses the legacy single-file fields, caps at 5 files, drops invalid keys', () => {
    const s = base();
    const dir = `houses/${H}/bills/${BILL}`;
    Object.assign(s.objects, { [`${dir}/old.pdf`]: 7 });
    Object.assign(s.houses[0]!.bills[0]!, { files: undefined, fileStoragePath: `${dir}/old.pdf`, fileName: 'old.pdf', fileMimeType: 'application/pdf', fileSizeBytes: 7 });
    expect(transform(s).plan.bills[0]!.files).toEqual([expect.objectContaining({ object_key: `${dir}/old.pdf`, size_bytes: 7 })]);

    const many = base();
    many.houses[0]!.bills[0]!.files = Array.from({ length: 7 }, (_, i) => ({ storagePath: `${dir}/f${i}.pdf`, mimeType: 'application/pdf' }));
    many.houses[0]!.bills[0]!.files!.push({ storagePath: 'weird path/x y.pdf', mimeType: 'application/pdf' });
    const r = transform(many);
    expect(r.plan.bills[0]!.files).toHaveLength(5);
    expect(r.issues.some((i) => i.level === 'fix' && i.message.includes('first 5'))).toBe(true);
  });

  it('warns when a stored effectiveDate would shift, and when files are missing or unreferenced', () => {
    const s = base();
    s.houses[0]!.bills[0]!.effectiveDate = '2025-03-14';
    s.objects['houses/x/bills/y/orphan.pdf'] = 1;
    s.objects['not a key'] = 1;
    delete s.objects['users/u1/avatar/a.jpg'];
    const { plan, issues } = transform(s);
    const msgs = issues.map((i) => i.message).join('\n');
    expect(msgs).toContain('differs from the derived 2025-03-15');
    expect(msgs).toContain('does not exist in the bucket');
    expect(msgs).toContain('not referenced by any migrated row: it is copied anyway');
    expect(msgs).toContain('not copied');
    const keys = plan.files.map((f) => f.key);
    expect(keys).toContain('houses/x/bills/y/orphan.pdf');
    expect(keys).not.toContain('not a key');
    expect(keys).not.toContain('users/u1/avatar/a.jpg'); // referenced but absent: reported, nothing to copy
  });

  it('derives effective_date from the creation day (UTC) when no dates are set', () => {
    const s = base();
    Object.assign(s.houses[0]!.bills[0]!, { chargeDate: null, effectiveDate: '2025-03-16' });
    expect(transform(s).issues.some((i) => i.message.includes('differs'))).toBe(false); // createdAt 2025-03-16T10:00Z
  });

  it("validKey agrees with the Worker's key rules", () => {
    for (const k of ['users/u/avatar/a.png', 'users/u/documents/d/p.pdf', `houses/${H}/bills/b/f.pdf`, 'users/u/avatar/..', 'houses/h/bills/b/a b.pdf', 'houses/h/other/x.png', 'users/u/avatar/a/b', '../x']) {
      expect(validKey(k), k).toBe(parseKey(k) !== null);
    }
  });
});
