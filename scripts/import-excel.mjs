// Imports the historical Excel (see scripts/extract-excel.py) into one house: categories, guest roommates (no account,
// with move-in/out dates), one bill per cost row (receipt downloaded from Google Drive and uploaded to Storage when it
// is still reachable), and the roommates' monthly payments. Every write goes through the real security rules.
//
//   node scripts/import-excel.mjs data.json "House name"            # dry run (no credentials needed)
//   IMPORT_EMAIL=… IMPORT_PASSWORD=… node scripts/import-excel.mjs data.json "House name" --apply
//
// The Firebase project is read from .env (EXPO_PUBLIC_FIREBASE_*), nothing project-specific lives in this file.
// Re-runnable: documents are keyed by deterministic ids (xl-…) and existing ones are skipped.
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  Timestamp, collection, collectionGroup, doc, getDoc, getDocs, getFirestore, limit, query, serverTimestamp, setDoc, where, writeBatch,
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes } from 'firebase/storage';

const [, , DATA, HOUSE_NAME] = process.argv;
const APPLY = process.argv.includes('--apply');
const { IMPORT_EMAIL, IMPORT_PASSWORD } = process.env;
if (!DATA || !HOUSE_NAME || (APPLY && (!IMPORT_EMAIL || !IMPORT_PASSWORD))) {
  console.error('usage: IMPORT_EMAIL=… IMPORT_PASSWORD=… node scripts/import-excel.mjs data.json "House name" [--apply]');
  process.exit(1);
}

try { process.loadEnvFile('.env'); } catch { /* variables may come from the environment */ }
const env = process.env;
const firebaseConfig = {
  apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY, authDomain: env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN, projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET, appId: env.EXPO_PUBLIC_FIREBASE_APP_ID,
};
if (Object.values(firebaseConfig).some((v) => !v)) {
  console.error('Missing EXPO_PUBLIC_FIREBASE_* variables: run from the project root with a filled .env');
  process.exit(1);
}
const app = initializeApp(firebaseConfig);
const auth = getAuth(app), db = getFirestore(app), storage = getStorage(app);

const data = JSON.parse(readFileSync(DATA, 'utf8'));
const cents = (eur) => Math.round(eur * 100);
const lastDay = (month) => { const [y, m] = month.split('-').map(Number); return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`; };
const ts = (isoDate) => Timestamp.fromDate(new Date(`${isoDate}T12:00:00Z`));
const guestId = (name) => 'guest_' + createHash('sha1').update(name).digest('hex').slice(0, 16);
const pool = async (items, n, fn) => { const out = []; let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } })); return out; };

const CATEGORIES = [
  { name: 'Alquiler', icon: 'home', color: '#007AFF', amountType: 'FIXED', intervalCount: 1 },
  { name: 'Luz', icon: 'flash', color: '#FF9500', amountType: 'VARIABLE', intervalCount: 1 },
  { name: 'Internet', icon: 'wifi', color: '#5856D6', amountType: 'FIXED', intervalCount: 1 },
  { name: 'Teléfono', icon: 'call', color: '#34C759', amountType: 'VARIABLE', intervalCount: 1 },
  { name: 'Gas', icon: 'flame', color: '#FF3B30', amountType: 'VARIABLE', intervalCount: 1 },
  { name: 'Limpieza', icon: 'sparkles', color: '#5AC8FA', amountType: 'VARIABLE', intervalCount: 1 },
  { name: 'Agua', icon: 'water', color: '#32ADE6', amountType: 'VARIABLE', intervalCount: 1 },
].map((c, sortOrder) => ({ ...c, id: 'xl-cat-' + c.name.toLowerCase().replace('é', 'e'), sortOrder }));
const catId = Object.fromEntries(CATEGORIES.map((c) => [c.name, c.id]));

// ---- plan
const months = data.map((s) => s.month);
const firstMonth = months[0], lastMonth = months[months.length - 1];
const guests = new Map();
for (const s of data) for (const p of s.people) {
  const g = guests.get(p.name) ?? { name: p.name, id: guestId(p.name), first: s.month, last: s.month, contribution: null };
  g.last = s.month; if (p.rent) g.contribution = p.rent; guests.set(p.name, g);
}
const bills = data.flatMap((s) => s.bills.filter((b) => b.amount > 0).map((b) => ({ ...b, month: s.month, id: `xl-${s.month}-r${b.row}` })));
const payments = data.flatMap((s) => s.people.filter((p) => p.paid > 0).map((p) => ({ month: s.month, name: p.name, paid: p.paid, id: `xl-${s.month}-${guestId(p.name).slice(6, 14)}` })));

console.log(`${data.length} months (${firstMonth} → ${lastMonth}), ${CATEGORIES.length} categories, ${guests.size} guest roommates, ${bills.length} bills (${bills.filter((b) => b.link).length} with Drive link), ${payments.length} payments`);
for (const g of guests.values()) console.log(`  ${g.name}: ${g.first} → ${g.last === lastMonth ? 'active' : g.last}, contribution ${g.contribution}`);
if (!APPLY) { console.log('\nDry run — nothing written. Re-run with --apply.'); process.exit(0); }

// ---- apply
const cred = await signInWithEmailAndPassword(auth, IMPORT_EMAIL, IMPORT_PASSWORD);
const uid = cred.user.uid;
const profileSnap = await getDoc(doc(db, 'users', uid));
const profile = profileSnap.exists() ? profileSnap.data() : { displayName: IMPORT_EMAIL.split('@')[0], email: IMPORT_EMAIL, photoPath: null };

let houseId = null;
for (const m of (await getDocs(query(collectionGroup(db, 'members'), where('uid', '==', uid), limit(50)))).docs) {
  const h = await getDoc(m.ref.parent.parent);
  if (h.exists() && h.data().name === HOUSE_NAME) houseId = h.id;
}
if (!houseId) {
  houseId = randomUUID();
  const batch = writeBatch(db);
  batch.set(doc(db, 'houses', houseId), {
    name: HOUSE_NAME, address: null, currency: 'EUR', splitMode: 'FIXED_CONTRIBUTION', fixedContributionCents: null,
    contributionDayOfMonth: null, showBalanceToRoommates: true, createdBy: uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'houses', houseId, 'members', uid), {
    uid, role: 'ADMIN', status: 'ACTIVE', joinedAt: serverTimestamp(), removedAt: null, individualContributionCents: null,
    displayName: profile.displayName, email: profile.email ?? IMPORT_EMAIL, photoPath: profile.photoPath ?? null, inviteCode: null,
  });
  await batch.commit();
  console.log(`created house ${houseId}`);
} else console.log(`using existing house ${houseId}`);

const h = (...p) => doc(db, 'houses', houseId, ...p);
const existing = async (name) => new Set((await getDocs(collection(db, 'houses', houseId, name))).docs.map((d) => d.id));
const createdAt = { createdAt: serverTimestamp(), updatedAt: serverTimestamp() };

const haveCats = await existing('categories');
for (const c of CATEGORIES.filter((c) => !haveCats.has(c.id))) {
  await setDoc(h('categories', c.id), {
    name: c.name, icon: c.icon, color: c.color, amountType: c.amountType, expectedAmountCents: null, intervalUnit: 'MONTH',
    intervalCount: c.intervalCount, anchorDate: `${firstMonth}-01`, isActive: true, sortOrder: c.sortOrder, notes: null, ...createdAt,
  });
}
console.log('categories ok');

const haveMembers = await existing('members');
for (const g of guests.values()) {
  if (haveMembers.has(g.id)) continue;
  const left = g.last === lastMonth ? null : lastDay(g.last);
  await setDoc(h('members', g.id), {
    uid: g.id, role: 'ROOMMATE', status: left ? 'REMOVED' : 'ACTIVE', joinedAt: ts(`${g.first}-01`), removedAt: left ? ts(left) : null,
    individualContributionCents: g.contribution ? cents(g.contribution) : null, displayName: g.name, email: '', photoPath: null, inviteCode: null,
  });
}
console.log('members ok');

const MAX = 10 * 1024 * 1024;
async function fetchDriveFile(link) {
  const id = link.match(/\/d\/([^/]+)/)?.[1];
  if (!id) return null;
  try {
    const r = await fetch(`https://drive.google.com/uc?export=download&id=${id}`, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow' });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX || buf.length < 8) return null;
    const mime = buf.subarray(0, 5).toString() === '%PDF-' ? 'application/pdf'
      : buf[0] === 0xff && buf[1] === 0xd8 ? 'image/jpeg' : buf.subarray(1, 4).toString() === 'PNG' ? 'image/png' : null;
    return mime ? { buf, mime } : null;
  } catch { return null; }
}
const EXT = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };
const safeName = (label, mime, fallback) => {
  const base = (label || fallback).replace(/[^\w.\- ()áéíóúñÁÉÍÓÚÑ]/g, '_').replace(/\.(pdf|jpe?g|png)$/i, '').trim().slice(0, 100) || fallback;
  return `${base}.${EXT[mime]}`;
};

const haveBills = await existing('bills');
const stats = { created: 0, withFile: 0, noLink: 0, linkFailed: 0, skipped: 0 };
const failed = [];
await pool(bills, 6, async (b) => {
  if (haveBills.has(b.id)) { stats.skipped++; return; }
  let file = null;
  if (b.link) { file = await fetchDriveFile(b.link); if (!file) { stats.linkFailed++; failed.push(`${b.month} ${b.label}: ${b.fileLabel}`); } } else stats.noLink++;
  let storageFields = { fileStoragePath: null, fileName: null, fileMimeType: null, fileSizeBytes: null };
  if (file) {
    const name = safeName(b.fileLabel, file.mime, b.id);
    const path = `houses/${houseId}/bills/${b.id}/${name}`;
    await uploadBytes(ref(storage, path), file.buf, { contentType: file.mime });
    storageFields = { fileStoragePath: path, fileName: name, fileMimeType: file.mime, fileSizeBytes: file.buf.length };
    stats.withFile++;
  }
  const notes = [b.label !== b.category ? b.label : null, b.bank, b.debitDate ? `Débito ${b.debitDate}` : null, !file && b.fileLabel ? `Recibo: ${b.fileLabel}` : null]
    .filter(Boolean).join(' · ').slice(0, 1000) || null;
  await setDoc(h('bills', b.id), {
    categoryId: catId[b.category], amountCents: cents(b.amount), chargeDate: null, periodStartDate: `${b.month}-01`, periodEndDate: lastDay(b.month),
    effectiveDate: lastDay(b.month), ...storageFields, notes, ocrStatus: 'NONE', ocrData: null, createdBy: uid, ...createdAt,
  });
  stats.created++;
});
console.log('bills', stats);
if (failed.length) console.log('receipts that could not be downloaded:\n  ' + failed.join('\n  '));

const havePayments = await existing('payments');
let np = 0;
for (const p of payments.filter((p) => !havePayments.has(p.id))) {
  await setDoc(h('payments', p.id), { memberId: guestId(p.name), month: `${p.month}-01`, amountCents: cents(p.paid), note: null, paidAt: serverTimestamp(), recordedBy: uid });
  np++;
}
console.log(`payments created: ${np}`);
console.log('done');
process.exit(0);
