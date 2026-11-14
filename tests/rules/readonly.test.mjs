// The frozen rules used during the cutover (scripts/make-readonly-rules.mjs): everything that could be read before still can,
// and nothing can be written, created, updated or deleted. Run with the emulators:  npm run test:rules:readonly
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';

import { toReadOnly } from '../../scripts/make-readonly-rules.mjs';

let env;
const H = 'house1';
const fsOf = (uid) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore());
const stOf = (uid) => env.authenticatedContext(uid).storage();

describe('toReadOnly', () => {
  it('keeps read methods and conditions, drops writes, handles mixed lists and multi-line conditions', () => {
    const src = `
      allow read: if a();
      allow create: if b();
      allow read, delete: if c()
        && d();
      allow create, update: if e();
      allow get: if f();
      allow list: if g();
      allow read, write: if false;
      allow write: if h();`;
    const out = toReadOnly(src);
    assert.match(out, /allow read: if a\(\);/);
    assert.match(out, /allow read: if c\(\)\n\s+&& d\(\);/); // the multi-line condition survives intact
    assert.match(out, /allow get: if f\(\);/);
    assert.match(out, /allow list: if g\(\);/);
    assert.match(out, /allow read: if false;/);
    assert.doesNotMatch(out, /allow\s[^:\n]*(create|update|delete|write)/);
    assert.equal((out.match(/write access removed/g) ?? []).length, 3);
  });

  it('is not fooled by semicolons and keywords inside comments and strings', () => {
    const src = `
      allow create: if x() && (
        // admins only; join/leave dates may be historical, allow create: if nothing
        y() && z.matches('^a;b$')
      );
      allow read: if p() /* a; b */ && q();
      // allow delete: if commented();`;
    const out = toReadOnly(src);
    assert.doesNotMatch(out, /y\(\)|z\.matches/); // the whole create statement, comments and string included, is gone
    assert.match(out, /allow read: if p\(\) \/\* a; b \*\/ && q\(\);/);
    assert.match(out, /\/\/ allow delete: if commented\(\);/); // comments are left alone
  });

  it('leaves no write rule in the real files', () => {
    for (const f of ['firestore.rules', 'storage.rules']) assert.doesNotMatch(toReadOnly(readFileSync(f, 'utf8')), /allow\s[^:\n]*\b(create|update|delete|write)\b/);
  });
});

describe('frozen rules, enforced by the emulators', () => {
  before(async () => {
    env = await initializeTestEnvironment({
      projectId: 'demo-costos',
      firestore: { rules: toReadOnly(readFileSync('firestore.rules', 'utf8')) },
      storage: { rules: toReadOnly(readFileSync('storage.rules', 'utf8')) },
    });
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore(), now = Timestamp.now();
      await setDoc(doc(db, 'users', 'adm'), { email: 'a@x.test', displayName: 'A', createdAt: now });
      await setDoc(doc(db, 'houses', H), { name: 'Piso', createdAt: now });
      await setDoc(doc(db, 'houses', H, 'members', 'adm'), { uid: 'adm', role: 'ADMIN', status: 'ACTIVE', joinedAt: now, removedAt: null });
      await setDoc(doc(db, 'houses', H, 'members', 'rm'), { uid: 'rm', role: 'ROOMMATE', status: 'ACTIVE', joinedAt: now, removedAt: null });
      await setDoc(doc(db, 'houses', H, 'categories', 'c1'), { name: 'Luz', createdAt: now });
      await setDoc(doc(db, 'houses', H, 'bills', 'b1'), { categoryId: 'c1', amountCents: 5000, createdAt: now });
      await setDoc(doc(db, 'houses', H, 'payments', 'p1'), { memberId: 'rm', amountCents: 100, month: '2026-03-01' });
      await uploadBytes(ref(ctx.storage(), `houses/${H}/bills/b1/inv.pdf`), new Uint8Array([1, 2, 3]), { contentType: 'application/pdf' });
    });
  });
  after(async () => env.cleanup());

  it('members still read their house, bills, payments and files', async () => {
    await assertSucceeds(getDoc(doc(fsOf('rm'), 'houses', H)));
    await assertSucceeds(getDoc(doc(fsOf('rm'), 'houses', H, 'bills', 'b1')));
    await assertSucceeds(getDoc(doc(fsOf('rm'), 'houses', H, 'payments', 'p1')));
    await assertSucceeds(getDocs(collection(fsOf('rm'), 'houses', H, 'categories')));
    await assertSucceeds(getDocs(query(collectionGroup(fsOf('rm'), 'members'), where('uid', '==', 'rm'))));
    await assertSucceeds(getBytes(ref(stOf('rm'), `houses/${H}/bills/b1/inv.pdf`)));
  });

  it('reads stay private: outsiders and signed-out users get nothing', async () => {
    await assertFails(getDoc(doc(fsOf('stranger'), 'houses', H)));
    await assertFails(getDoc(doc(fsOf('stranger'), 'houses', H, 'bills', 'b1')));
    await assertFails(getDoc(doc(fsOf(null), 'users', 'adm')));
    await assertFails(getBytes(ref(stOf('stranger'), `houses/${H}/bills/b1/inv.pdf`)));
  });

  it('no write of any kind succeeds, not even for the admin / the owner', async () => {
    await assertFails(setDoc(doc(fsOf('adm'), 'houses', H, 'bills', 'b2'), { categoryId: 'c1', amountCents: 1 }));
    await assertFails(updateDoc(doc(fsOf('adm'), 'houses', H), { name: 'x' }));
    await assertFails(deleteDoc(doc(fsOf('adm'), 'houses', H, 'bills', 'b1')));
    await assertFails(setDoc(doc(fsOf('adm'), 'houses', H, 'payments', 'p2'), { memberId: 'rm', amountCents: 1 }));
    await assertFails(setDoc(doc(fsOf('adm'), 'users', 'adm'), { email: 'a@x.test', displayName: 'A' }));
    await assertFails(setDoc(doc(fsOf('adm'), 'invites', 'K7QXM2PD'), { houseId: H }));
    await assertFails(updateDoc(doc(fsOf('rm'), 'houses', H, 'members', 'rm'), { status: 'REMOVED' })); // leaving a house is a write too
    await assertFails(uploadBytes(ref(stOf('adm'), `houses/${H}/bills/b9/new.pdf`), new Uint8Array([1]), { contentType: 'application/pdf' }));
    await assertFails(deleteObject(ref(stOf('adm'), `houses/${H}/bills/b1/inv.pdf`)));
    await assertFails(uploadBytes(ref(stOf('adm'), 'users/adm/avatar/a.png'), new Uint8Array([1]), { contentType: 'image/png' }));
  });
});
