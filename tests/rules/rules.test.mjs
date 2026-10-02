// Security-rules tests for firestore.rules and storage.rules.
// Run with the emulators:  npm run test:rules   (firebase emulators:exec --only firestore,storage ...)
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, it } from 'node:test';

import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  Timestamp,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';

const H = 'house1';
const CODE = 'K7QXM2PD';
let env;

const fsOf = (uid) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore());
const stOf = (uid) => env.authenticatedContext(uid).storage();
const inDays = (n) => Timestamp.fromMillis(Date.now() + n * 86_400_000);

const memberData = (uid, over = {}) => ({
  uid, role: 'ROOMMATE', status: 'ACTIVE', joinedAt: serverTimestamp(), removedAt: null,
  individualContributionCents: null, displayName: uid, email: `${uid}@x.test`, photoPath: null, inviteCode: null, ...over,
});
const houseData = (over = {}) => ({
  name: 'Piso', address: null, currency: 'EUR', splitMode: 'EQUAL', fixedContributionCents: null,
  contributionDayOfMonth: null, showBalanceToRoommates: true, createdBy: 'adm', createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(), ...over,
});
const categoryData = (over = {}) => ({
  name: 'Luz', icon: 'flash', color: '#FF9500', amountType: 'VARIABLE', expectedAmountCents: null, intervalUnit: 'MONTH',
  intervalCount: 1, anchorDate: '2026-01-01', isActive: true, sortOrder: 0, notes: null,
  createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...over,
});
const billData = (over = {}) => ({
  categoryId: 'cat1', amountCents: 5000, chargeDate: '2026-03-10', periodStartDate: null, periodEndDate: null,
  effectiveDate: '2026-03-10', fileStoragePath: null, fileName: null, fileMimeType: null, fileSizeBytes: null, notes: null,
  ocrStatus: 'NONE', ocrData: null, createdBy: 'adm', createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...over,
});
const paymentData = (over = {}) => ({
  memberId: 'rm', month: '2026-03-01', amountCents: 40000, note: null, paidAt: serverTimestamp(), recordedBy: 'adm', ...over,
});
const userData = (over = {}) => ({
  email: 'a@x.test', displayName: 'A', photoPath: null, accountRole: 'ADMIN', locale: 'es',
  createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...over,
});

/** House with an admin ('adm'), an active roommate ('rm'), a category and one live invite. */
async function seed() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const now = Timestamp.now();
    await setDoc(doc(db, 'houses', H), { ...houseData(), createdAt: now, updatedAt: now });
    await setDoc(doc(db, 'houses', H, 'members', 'adm'), { ...memberData('adm', { role: 'ADMIN' }), joinedAt: now });
    await setDoc(doc(db, 'houses', H, 'members', 'rm'), { ...memberData('rm'), joinedAt: now });
    await setDoc(doc(db, 'houses', H, 'categories', 'cat1'), { ...categoryData(), createdAt: now, updatedAt: now });
    await setDoc(doc(db, 'invites', CODE), {
      houseId: H, status: 'ACTIVE', expiresAt: inDays(7), maxUses: 1, usedCount: 0, createdBy: 'adm', createdAt: now,
    });
    await setDoc(doc(db, 'users', 'adm', 'documents', 'd1'), {
      type: 'PASSPORT', storagePath: 'users/adm/documents/d1/p.pdf', fileName: 'p.pdf', mimeType: 'application/pdf', sizeBytes: 10, uploadedAt: now,
    });
  });
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-costos',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    storage: { rules: readFileSync('storage.rules', 'utf8') },
  });
});
after(async () => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await seed();
});

/** Redeem batch as `uid` for house H with the given overrides. */
function joinBatch(uid, { memberOver = {}, code = CODE, incrementBy = 1 } = {}) {
  const db = fsOf(uid);
  const batch = writeBatch(db);
  batch.set(doc(db, 'houses', H, 'members', uid), memberData(uid, { inviteCode: code, ...memberOver }));
  batch.update(doc(db, 'invites', code), { usedCount: increment(incrementBy) });
  return batch.commit();
}

describe('unauthenticated', () => {
  it('cannot read anything', async () => {
    const db = fsOf(null);
    await assertFails(getDoc(doc(db, 'houses', H)));
    await assertFails(getDoc(doc(db, 'users', 'adm')));
    await assertFails(getDoc(doc(db, 'invites', CODE)));
  });
});

describe('users', () => {
  it('owner can create and read own profile; others cannot', async () => {
    await assertSucceeds(setDoc(doc(fsOf('u1'), 'users', 'u1'), userData()));
    await assertSucceeds(getDoc(doc(fsOf('u1'), 'users', 'u1')));
    await assertFails(getDoc(doc(fsOf('u2'), 'users', 'u1')));
    await assertFails(setDoc(doc(fsOf('u2'), 'users', 'u1'), userData()));
  });
  it('rejects invalid fields', async () => {
    await assertFails(setDoc(doc(fsOf('u1'), 'users', 'u1'), userData({ accountRole: 'SUPERUSER' })));
    await assertFails(setDoc(doc(fsOf('u1'), 'users', 'u1'), userData({ extra: 1 })));
    await assertFails(setDoc(doc(fsOf('u1'), 'users', 'u1'), userData({ displayName: '' })));
  });
  it('identity documents are owner-only, even for house admins', async () => {
    await assertSucceeds(getDoc(doc(fsOf('adm'), 'users', 'adm', 'documents', 'd1')));
    await assertFails(getDoc(doc(fsOf('rm'), 'users', 'adm', 'documents', 'd1')));
    await assertFails(getDoc(doc(fsOf('stranger'), 'users', 'rm', 'documents', 'x')));
    await assertFails(setDoc(doc(fsOf('rm'), 'users', 'adm', 'documents', 'd2'), {}));
  });
});

describe('houses', () => {
  it('creator bootstraps house + ADMIN member in one batch', async () => {
    const db = fsOf('new');
    const batch = writeBatch(db);
    batch.set(doc(db, 'houses', 'h2'), houseData({ createdBy: 'new' }));
    batch.set(doc(db, 'houses', 'h2', 'members', 'new'), memberData('new', { role: 'ADMIN' }));
    await assertSucceeds(batch.commit());
  });
  it('rejects a house without its admin member, or with someone else as creator', async () => {
    await assertFails(setDoc(doc(fsOf('new'), 'houses', 'h2'), houseData({ createdBy: 'new' })));
    const db = fsOf('new');
    const batch = writeBatch(db);
    batch.set(doc(db, 'houses', 'h3'), houseData({ createdBy: 'adm' }));
    batch.set(doc(db, 'houses', 'h3', 'members', 'new'), memberData('new', { role: 'ADMIN' }));
    await assertFails(batch.commit());
  });
  it('cannot self-promote into an existing house as ADMIN', async () => {
    await assertFails(setDoc(doc(fsOf('evil'), 'houses', H, 'members', 'evil'), memberData('evil', { role: 'ADMIN' })));
  });
  it('only active members read; only admins update/delete', async () => {
    await assertSucceeds(getDoc(doc(fsOf('rm'), 'houses', H)));
    await assertFails(getDoc(doc(fsOf('outsider'), 'houses', H)));
    await assertFails(updateDoc(doc(fsOf('rm'), 'houses', H), { name: 'Hacked', updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(fsOf('adm'), 'houses', H), { name: 'Nuevo', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(fsOf('adm'), 'houses', H), { createdBy: 'rm', updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(fsOf('rm'), 'houses', H)));
  });
  it('a removed member loses access', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      updateDoc(doc(ctx.firestore(), 'houses', H, 'members', 'rm'), { status: 'REMOVED', removedAt: Timestamp.now() }),
    );
    await assertFails(getDoc(doc(fsOf('rm'), 'houses', H)));
    await assertFails(getDocs(collection(fsOf('rm'), 'houses', H, 'bills')));
  });
});

describe('invites and joining', () => {
  it('admin creates invites; roommates and outsiders cannot', async () => {
    const data = { houseId: H, status: 'ACTIVE', expiresAt: inDays(7), maxUses: 2, usedCount: 0, createdBy: 'adm', createdAt: serverTimestamp() };
    await assertSucceeds(setDoc(doc(fsOf('adm'), 'invites', 'ABCDEFGH'), data));
    await assertFails(setDoc(doc(fsOf('rm'), 'invites', 'ABCDEFGJ'), { ...data, createdBy: 'rm' }));
    await assertFails(setDoc(doc(fsOf('adm'), 'invites', 'abcdefgh'), data)); // bad code format
    await assertFails(setDoc(doc(fsOf('adm'), 'invites', 'ABCDEFGK'), { ...data, expiresAt: inDays(90) }));
    await assertFails(setDoc(doc(fsOf('adm'), 'invites', 'ABCDEFGM'), { ...data, usedCount: 5 }));
  });
  it('listing invites is admin-only', async () => {
    const q = (uid) => getDocs(query(collection(fsOf(uid), 'invites'), where('houseId', '==', H)));
    await assertSucceeds(q('adm'));
    await assertFails(q('rm'));
    await assertFails(q('outsider'));
  });
  it('a signed-in user can join with a valid code (member + usedCount+1 in one batch)', async () => {
    await assertSucceeds(joinBatch('newbie'));
    await assertSucceeds(getDoc(doc(fsOf('newbie'), 'houses', H)));
  });
  it('rejects joining without incrementing usedCount, or incrementing by more', async () => {
    await assertFails(joinBatch('newbie', { incrementBy: 0 }));
    await assertFails(joinBatch('newbie', { incrementBy: 2 }));
  });
  it('rejects joining as ADMIN, with someone else’s uid or with an unrelated code', async () => {
    await assertFails(joinBatch('newbie', { memberOver: { role: 'ADMIN' } }));
    const db = fsOf('newbie');
    const batch = writeBatch(db);
    batch.set(doc(db, 'houses', H, 'members', 'someone-else'), memberData('someone-else', { inviteCode: CODE }));
    batch.update(doc(db, 'invites', CODE), { usedCount: increment(1) });
    await assertFails(batch.commit());
  });
  it('rejects member creation without the invite update, and bare invite increments', async () => {
    await assertFails(setDoc(doc(fsOf('newbie'), 'houses', H, 'members', 'newbie'), memberData('newbie', { inviteCode: CODE })));
    await assertFails(updateDoc(doc(fsOf('newbie'), 'invites', CODE), { usedCount: increment(1) }));
  });
  it('enforces maxUses, revocation and expiry', async () => {
    await assertSucceeds(joinBatch('first'));
    await assertFails(joinBatch('second')); // maxUses 1 reached
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'invites', 'REVOKEDX'), { houseId: H, status: 'REVOKED', expiresAt: inDays(7), maxUses: 5, usedCount: 0, createdBy: 'adm', createdAt: Timestamp.now() });
      await setDoc(doc(db, 'invites', 'EXPIREDX'), { houseId: H, status: 'ACTIVE', expiresAt: Timestamp.fromMillis(Date.now() - 1000), maxUses: 5, usedCount: 0, createdBy: 'adm', createdAt: Timestamp.now() });
    });
    await assertFails(joinBatch('third', { code: 'REVOKEDX' }));
    await assertFails(joinBatch('fourth', { code: 'EXPIREDX' }));
  });
  it('the same user cannot join twice', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      updateDoc(doc(ctx.firestore(), 'invites', CODE), { maxUses: 5 }),
    );
    await assertSucceeds(joinBatch('newbie'));
    await assertFails(joinBatch('newbie'));
  });
  it('admin can revoke; roommate cannot', async () => {
    await assertFails(updateDoc(doc(fsOf('rm'), 'invites', CODE), { status: 'REVOKED' }));
    await assertSucceeds(updateDoc(doc(fsOf('adm'), 'invites', CODE), { status: 'REVOKED' }));
  });
});

describe('members', () => {
  const memberRef = (uid, target) => doc(fsOf(uid), 'houses', H, 'members', target);
  it('roommate can leave but not rejoin by themselves', async () => {
    await assertSucceeds(updateDoc(memberRef('rm', 'rm'), { status: 'REMOVED', removedAt: serverTimestamp() }));
    await assertFails(updateDoc(memberRef('rm', 'rm'), { status: 'ACTIVE', removedAt: null }));
  });
  it('roommate cannot change role, remove others or edit contributions', async () => {
    await assertFails(updateDoc(memberRef('rm', 'rm'), { role: 'ADMIN' }));
    await assertFails(updateDoc(memberRef('rm', 'adm'), { status: 'REMOVED', removedAt: serverTimestamp() }));
    await assertFails(updateDoc(memberRef('rm', 'rm'), { individualContributionCents: 1 }));
  });
  it('admin removes/reactivates roommates and sets contributions, but never removes an admin', async () => {
    await assertSucceeds(updateDoc(memberRef('adm', 'rm'), { status: 'REMOVED', removedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(memberRef('adm', 'rm'), { status: 'ACTIVE', removedAt: null }));
    await assertSucceeds(updateDoc(memberRef('adm', 'rm'), { individualContributionCents: 30000 }));
    await assertFails(updateDoc(memberRef('adm', 'adm'), { status: 'REMOVED', removedAt: serverTimestamp() }));
    await assertFails(updateDoc(memberRef('adm', 'rm'), { role: 'ADMIN' }));
  });
  it('members read the roster; outsiders cannot; users read their own memberships via collection group', async () => {
    await assertSucceeds(getDocs(collection(fsOf('rm'), 'houses', H, 'members')));
    await assertFails(getDocs(collection(fsOf('outsider'), 'houses', H, 'members')));
    await assertSucceeds(getDocs(query(collectionGroup(fsOf('rm'), 'members'), where('uid', '==', 'rm'))));
    await assertFails(getDocs(query(collectionGroup(fsOf('rm'), 'members'), where('uid', '==', 'adm'))));
    await assertFails(getDocs(collectionGroup(fsOf('rm'), 'members')));
  });
  it('member can refresh their own denormalized profile only', async () => {
    await assertSucceeds(updateDoc(memberRef('rm', 'rm'), { displayName: 'Nuevo' }));
    await assertFails(updateDoc(memberRef('rm', 'adm'), { displayName: 'Hacked' }));
  });
});

describe('categories', () => {
  const cats = (uid) => collection(fsOf(uid), 'houses', H, 'categories');
  it('admin writes, members read, others blocked', async () => {
    await assertSucceeds(setDoc(doc(cats('adm'), 'c2'), categoryData({ name: 'Gas' })));
    await assertFails(setDoc(doc(cats('rm'), 'c3'), categoryData()));
    await assertSucceeds(getDocs(cats('rm')));
    await assertFails(getDocs(cats('outsider')));
  });
  it('validates fields', async () => {
    await assertFails(setDoc(doc(cats('adm'), 'c4'), categoryData({ amountType: 'MAYBE' })));
    await assertFails(setDoc(doc(cats('adm'), 'c5'), categoryData({ amountType: 'FIXED', expectedAmountCents: null })));
    await assertSucceeds(setDoc(doc(cats('adm'), 'c6'), categoryData({ amountType: 'FIXED', expectedAmountCents: 1500 })));
    await assertFails(setDoc(doc(cats('adm'), 'c7'), categoryData({ intervalCount: 0 })));
    await assertFails(setDoc(doc(cats('adm'), 'c8'), categoryData({ color: 'red' })));
    await assertFails(setDoc(doc(cats('adm'), 'c9'), categoryData({ anchorDate: '03/01/2026' })));
  });
});

describe('bills', () => {
  const bills = (uid) => collection(fsOf(uid), 'houses', H, 'bills');
  it('admin creates; roommate and outsider cannot; members read', async () => {
    await assertSucceeds(setDoc(doc(bills('adm'), 'b1'), billData()));
    await assertFails(setDoc(doc(bills('rm'), 'b2'), billData({ createdBy: 'rm' })));
    await assertSucceeds(getDoc(doc(bills('rm'), 'b1')));
    await assertFails(getDoc(doc(bills('outsider'), 'b1')));
  });
  it('validates amount, category, dates and file path', async () => {
    await assertFails(setDoc(doc(bills('adm'), 'x1'), billData({ amountCents: 0 })));
    await assertFails(setDoc(doc(bills('adm'), 'x2'), billData({ amountCents: 10_000_000 })));
    await assertFails(setDoc(doc(bills('adm'), 'x3'), billData({ categoryId: 'nope' })));
    await assertFails(setDoc(doc(bills('adm'), 'x4'), billData({ effectiveDate: '2026-04-01' })));
    await assertFails(setDoc(doc(bills('adm'), 'x5'), billData({ fileStoragePath: 'houses/other/bills/b/x.pdf' })));
    await assertSucceeds(setDoc(doc(bills('adm'), 'x6'), billData({ fileStoragePath: `houses/${H}/bills/x6/a.pdf`, fileName: 'a.pdf', fileMimeType: 'application/pdf', fileSizeBytes: 100 })));
    await assertFails(setDoc(doc(bills('adm'), 'x7'), billData({ fileMimeType: 'application/x-msdownload' })));
    await assertSucceeds(setDoc(doc(bills('adm'), 'x8'), billData({ chargeDate: null, periodEndDate: '2026-03-31', effectiveDate: '2026-03-31' })));
    await assertFails(setDoc(doc(bills('adm'), 'x9'), billData({ createdBy: 'rm' })));
  });
  it('admin can edit and delete; roommates cannot', async () => {
    await assertSucceeds(setDoc(doc(bills('adm'), 'b1'), billData()));
    await assertSucceeds(updateDoc(doc(bills('adm'), 'b1'), { amountCents: 6000, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(bills('rm'), 'b1'), { amountCents: 1, updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(bills('rm'), 'b1')));
    await assertSucceeds(deleteDoc(doc(bills('adm'), 'b1')));
  });
});

describe('payments', () => {
  const pays = (uid) => collection(fsOf(uid), 'houses', H, 'payments');
  it('admin records for members of the house; payments are immutable', async () => {
    await assertSucceeds(setDoc(doc(pays('adm'), 'p1'), paymentData()));
    await assertFails(setDoc(doc(pays('adm'), 'p2'), paymentData({ memberId: 'ghost' })));
    await assertFails(setDoc(doc(pays('adm'), 'p3'), paymentData({ month: '2026-03-15' })));
    await assertFails(setDoc(doc(pays('rm'), 'p4'), paymentData({ recordedBy: 'rm' })));
    await assertFails(updateDoc(doc(pays('adm'), 'p1'), { amountCents: 1 }));
    await assertSucceeds(getDoc(doc(pays('rm'), 'p1')));
    await assertFails(getDoc(doc(pays('outsider'), 'p1')));
    await assertSucceeds(deleteDoc(doc(pays('adm'), 'p1')));
  });
});

describe('client flows (same write sequences as src/lib/db.ts)', () => {
  it('deleteHouse: children first, then house + own admin member in one batch', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'houses', H, 'bills', 'b1'), { ...billData(), createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
      await setDoc(doc(db, 'houses', H, 'payments', 'p1'), { ...paymentData(), paidAt: Timestamp.now() });
    });
    const db = fsOf('adm');
    await assertFails(deleteDoc(doc(fsOf('rm'), 'houses', H, 'bills', 'b1')));
    await assertSucceeds(deleteDoc(doc(db, 'houses', H, 'bills', 'b1')));
    await assertSucceeds(deleteDoc(doc(db, 'houses', H, 'payments', 'p1')));
    await assertSucceeds(deleteDoc(doc(db, 'houses', H, 'categories', 'cat1')));
    const invites = await assertSucceeds(getDocs(query(collection(db, 'invites'), where('houseId', '==', H))));
    for (const i of invites.docs) await assertSucceeds(deleteDoc(i.ref));
    await assertSucceeds(deleteDoc(doc(db, 'houses', H, 'members', 'rm')));
    await assertFails(deleteDoc(doc(db, 'houses', H, 'members', 'adm'))); // alone: house still exists
    const batch = writeBatch(db);
    batch.delete(doc(db, 'houses', H));
    batch.delete(doc(db, 'houses', H, 'members', 'adm'));
    await assertSucceeds(batch.commit());
  });
  it('account deletion: roommate leaves, then anonymises the denormalized copy', async () => {
    const db = fsOf('rm');
    const batch = writeBatch(db);
    batch.update(doc(db, 'houses', H, 'members', 'rm'), { status: 'REMOVED', removedAt: serverTimestamp() });
    await assertSucceeds(batch.commit());
    await assertSucceeds(updateDoc(doc(db, 'houses', H, 'members', 'rm'), { displayName: 'Cuenta eliminada', email: '', photoPath: null }));
  });
  it('profile sync: batch update of displayName/photoPath across memberships', async () => {
    const db = fsOf('rm');
    const batch = writeBatch(db);
    batch.update(doc(db, 'houses', H, 'members', 'rm'), { displayName: 'Nuevo', photoPath: 'users/rm/avatar/a.jpg' });
    await assertSucceeds(batch.commit());
  });
  it('bill edit: changing dates keeps effectiveDate consistent', async () => {
    const db = fsOf('adm');
    await assertSucceeds(setDoc(doc(db, 'houses', H, 'bills', 'b9'), billData()));
    await assertSucceeds(updateDoc(doc(db, 'houses', H, 'bills', 'b9'), { chargeDate: '2026-04-02', effectiveDate: '2026-04-02', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, 'houses', H, 'bills', 'b9'), { chargeDate: '2026-05-02', updatedAt: serverTimestamp() }));
  });
});

describe('storage', () => {
  const pdf = new Uint8Array([37, 80, 68, 70]);
  const billRef = (uid, path = `houses/${H}/bills/b1/inv.pdf`) => ref(stOf(uid), path);
  it('admin uploads bills (pdf/image); roommates and outsiders cannot', async () => {
    await assertSucceeds(uploadBytes(billRef('adm'), pdf, { contentType: 'application/pdf' }));
    await assertFails(uploadBytes(billRef('rm', `houses/${H}/bills/b2/inv.pdf`), pdf, { contentType: 'application/pdf' }));
    await assertFails(uploadBytes(billRef('outsider', `houses/${H}/bills/b3/inv.pdf`), pdf, { contentType: 'application/pdf' }));
  });
  it('rejects bad types and oversized files', async () => {
    await assertFails(uploadBytes(billRef('adm', `houses/${H}/bills/b4/a.exe`), pdf, { contentType: 'application/x-msdownload' }));
    await assertFails(uploadBytes(billRef('adm', `houses/${H}/bills/b5/big.pdf`), new Uint8Array(11 * 1024 * 1024), { contentType: 'application/pdf' }));
  });
  it('members read bills; outsiders cannot', async () => {
    await uploadBytes(billRef('adm'), pdf, { contentType: 'application/pdf' });
    await assertSucceeds(getBytes(billRef('rm')));
    await assertFails(getBytes(billRef('outsider')));
    await assertFails(deleteObject(billRef('rm')));
    await assertSucceeds(deleteObject(billRef('adm')));
  });
  it('identity documents are owner-only; avatars owner-write', async () => {
    const own = ref(stOf('rm'), 'users/rm/documents/d1/id.pdf');
    await assertSucceeds(uploadBytes(own, pdf, { contentType: 'application/pdf' }));
    await assertSucceeds(getBytes(own));
    await assertFails(getBytes(ref(stOf('adm'), 'users/rm/documents/d1/id.pdf')));
    await assertFails(uploadBytes(ref(stOf('adm'), 'users/rm/documents/d2/id.pdf'), pdf, { contentType: 'application/pdf' }));
    await assertSucceeds(uploadBytes(ref(stOf('rm'), 'users/rm/avatar/a.jpg'), pdf, { contentType: 'image/jpeg' }));
    await assertFails(uploadBytes(ref(stOf('adm'), 'users/rm/avatar/b.jpg'), pdf, { contentType: 'image/jpeg' }));
    await assertFails(uploadBytes(ref(stOf('rm'), 'users/rm/avatar/c.pdf'), pdf, { contentType: 'application/pdf' }));
  });
  it('denies everything else', async () => {
    await assertFails(uploadBytes(ref(stOf('adm'), 'random/file.pdf'), pdf, { contentType: 'application/pdf' }));
  });
});
