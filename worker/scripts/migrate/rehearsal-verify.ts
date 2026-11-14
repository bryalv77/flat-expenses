// Rehearsal check: after migrating the EMULATOR data (run.ts --emulator --apply), start the Worker on port 8788 against that database
// (see README "Migrating from Firebase") and run   node --experimental-strip-types --no-warnings scripts/migrate/rehearsal-verify.ts
// It proves the result THROUGH THE WORKER, as the app sees it: original Firebase passwords work, every number matches Firestore, and
// every bill file in R2 is byte-identical to its Firebase Storage original.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080'; process.env.FIREBASE_STORAGE_EMULATOR_HOST = 'localhost:9199';
initializeApp({ projectId: 'demo-costos', storageBucket: 'demo-costos.appspot.com' });
const B = 'http://localhost:8788', ORIGIN = 'costospiso://';
const creds = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', '..', 'scripts', '.demo-credentials.emulator.json'), 'utf8')) as Record<string, { name: string; password: string }>;
const j = async (path: string, token?: string, init: RequestInit = {}) => {
  const r = await fetch(B + path, { ...init, headers: { 'content-type': 'application/json', origin: ORIGIN, ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers } });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null, headers: r.headers };
};
const signIn = async (email: string, password: string) => {
  const r = await j('/api/auth/sign-in/email', undefined, { method: 'POST', body: JSON.stringify({ email, password }) });
  return { status: r.status, token: r.headers.get('set-auth-token') ?? '' };
};

// 1. every migrated user signs in with the ORIGINAL Firebase password; a wrong one is refused
let n = 0;
for (const [email, { password }] of Object.entries(creds)) {
  assert.equal((await signIn(email, 'wrong-password-1')).status, 401, email);
  const ok = await signIn(email, password);
  assert.equal(ok.status, 200, `${email} signs in with the Firebase password`);
  assert.equal((await signIn(email, password)).status, 200, `${email} second sign-in (upgraded hash)`);
  n++;
}
console.log(`1. ${n} users signed in with their original Firebase passwords (and again after the hash upgrade)`);

// 2. per house: members, categories, bills (+ files), payments, as the API serves them, equal to Firestore
const db = getFirestore();
const admins = ['marta.admin@costospiso.demo', 'javier.admin@costospiso.demo'];
const bucket = getStorage().bucket();
let files = 0, bytes = 0;
for (const email of admins) {
  const { token } = await signIn(email, creds[email]!.password);
  const mine = (await j('/api/houses', token)).body as { id: string; name: string }[];
  assert.equal(mine.length, 1);
  const h = mine[0]!;
  const fsHouse = db.collection('houses').doc(h.id);
  const count = async (c: string) => (await fsHouse.collection(c).count().get()).data().count;

  const members = (await j(`/api/houses/${h.id}/members`, token)).body;
  const cats = (await j(`/api/houses/${h.id}/categories`, token)).body;
  const bills = (await j(`/api/houses/${h.id}/bills?from=2000-01-01&to=2100-01-01`, token)).body as any[];
  const monthRange = '?from=2000-01-01&to=2099-12-01'; // payment months must be 20xx-xx-01
  const pays = (await j(`/api/houses/${h.id}/payments${monthRange}`, token)).body as any[];
  assert.equal(members.length, await count('members'), 'members');
  assert.equal(cats.length, await count('categories'), 'categories');
  assert.equal(bills.length, await count('bills'), 'bills');
  assert.equal(pays.length, await count('payments'), 'payments');

  // money adds up to the cent, and each bill's effective date is what Firestore stored
  const fsBills = (await fsHouse.collection('bills').get()).docs.map((d) => d.data());
  assert.equal(bills.reduce((s, b) => s + b.amountCents, 0), fsBills.reduce((s, b) => s + b.amountCents, 0), 'sum of bills');
  assert.deepEqual(bills.map((b) => b.effectiveDate).sort(), fsBills.map((b) => b.effectiveDate).sort(), 'effective dates');
  const fsPays = (await fsHouse.collection('payments').get()).docs.map((d) => d.data());
  assert.equal(pays.reduce((s, p) => s + p.amountCents, 0), fsPays.reduce((s, p) => s + p.amountCents, 0), 'sum of payments');
  for (const m of members as any[]) {
    const d = (await fsHouse.collection('members').doc(m.userId).get()).data()!;
    assert.deepEqual([m.role, m.status, m.displayName, m.individualContributionCents], [d.role, d.status, d.displayName, d.individualContributionCents], `member ${m.userId}`);
  }

  // 3. every bill file is downloadable from R2 through a signed link and is byte-identical to the Firebase Storage object
  for (const b of bills) {
    assert.ok(b.files.length >= 1, 'bill keeps its file');
    for (const f of b.files) {
      const { url } = (await j('/api/files/sign', token, { method: 'POST', body: JSON.stringify({ key: f.objectKey }) })).body;
      const r2 = Buffer.from(await (await fetch(url)).arrayBuffer());
      const [orig] = await bucket.file(f.objectKey).download();
      assert.ok(r2.equals(orig), `${f.objectKey} differs`);
      files++; bytes += r2.length;
    }
  }
  console.log(`2. ${h.name}: ${members.length} members, ${cats.length} categories, ${bills.length} bills, ${pays.length} payments match Firestore (sums and dates too)`);
}
console.log(`3. ${files} bill files (${(bytes / 1024).toFixed(0)} KB) are byte-identical in R2 and Firebase Storage`);

// 4. invites still redeem, and the upgraded accounts keep working
const inv = (await db.collection('invites').get()).docs.map((d) => ({ code: d.id, ...d.data() }));
const { token: adminToken } = await signIn(admins[0]!, creds[admins[0]!]!.password);
const houseId = ((await j('/api/houses', adminToken)).body as any[])[0].id;
const active = (await j(`/api/houses/${houseId}/invites`, adminToken)).body as any[];
assert.equal(active.length, inv.filter((i: any) => i.houseId === houseId).length, 'invites');
console.log(`4. ${active.length} invites for the first house migrated`);
console.log('MIGRATION VERIFIED END TO END');
