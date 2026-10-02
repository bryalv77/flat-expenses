// Demo data seeder (Firestore + Storage). Authenticates as each demo user with the Firebase JS SDK so every
// write goes through the real security rules: users, 2 houses (2 admins, 2 roommates each, roommates join
// through real invite codes), 7 categories per house, 12 months of bills with generated PDF invoices
// uploaded to Storage, and member payments for the fixed-contribution house.
//
//   node scripts/seed-demo.mjs               # against the real project (costos-piso)
//   node scripts/seed-demo.mjs --emulator    # against local emulators (project demo-costos)
//
// Re-runnable: an admin that already has a house is skipped. Credentials are written to
// scripts/.demo-credentials.json (gitignored) — real runs and emulator runs use separate files.
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword, updateProfile,
} from 'firebase/auth';
import {
  Timestamp, collection, collectionGroup, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore, increment, limit,
  query, serverTimestamp, setDoc, where, writeBatch,
} from 'firebase/firestore';
import { connectStorageEmulator, getStorage, ref, uploadBytes } from 'firebase/storage';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const EMULATOR = process.argv.includes('--emulator');
const CONFIG = EMULATOR
  ? { apiKey: 'demo-key', projectId: 'demo-costos', storageBucket: 'demo-costos.appspot.com' }
  : {
      apiKey: 'AIzaSyA7La5uaZjWfCRQYglvVtQ5K8azOWZO-VU', authDomain: 'costos-piso.firebaseapp.com', projectId: 'costos-piso',
      storageBucket: 'costos-piso.firebasestorage.app', appId: '1:292130454121:web:1fb0edd8bcd5292eb040f8',
    };
const CRED_FILE = new URL(EMULATOR ? './.demo-credentials.emulator.json' : './.demo-credentials.json', import.meta.url);

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const genCode = () => Array.from(randomBytes(8), (b) => ALPHABET[b % ALPHABET.length]).join('');
const genPassword = () => 'Demo-' + Array.from(randomBytes(6), (b) => ALPHABET[b % ALPHABET.length]).join('') + '!7';

// ---- deterministic noise so re-runs look the same
let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const between = (a, b) => a + rnd() * (b - a);

const HOUSES = [
  {
    name: 'Piso Gracia', address: 'Carrer de Verdi 112, 08012 Barcelona', splitMode: 'EQUAL', rent: 120000, internet: 3990,
    admin: { name: 'Marta Vidal', email: 'marta.admin@costospiso.demo' },
    roommates: [
      { name: 'Pablo Ruiz', email: 'pablo.roomie@costospiso.demo' },
      { name: 'Lucía Torres', email: 'lucia.roomie@costospiso.demo' },
    ],
  },
  {
    name: 'Piso Malasaña', address: 'Calle del Pez 24, 28004 Madrid', splitMode: 'FIXED_CONTRIBUTION', fixed: 85000, rent: 135000, internet: 5200,
    admin: { name: 'Javier Moreno', email: 'javier.admin@costospiso.demo' },
    roommates: [
      { name: 'Elena Navarro', email: 'elena.roomie@costospiso.demo' },
      { name: 'Diego Santos', email: 'diego.roomie@costospiso.demo' },
    ],
  },
];

const PROVIDERS = {
  Alquiler: 'Inmobiliaria Centro S.L.', Luz: 'Iberdrola Clientes S.A.U.', Internet: 'Movistar Fusión', 'Teléfono': 'Vodafone España',
  Gas: 'Naturgy Iberia S.A.', Limpieza: 'Limpiezas Brillo S.L.', Agua: 'Aguas Municipales',
};

// ---- date helpers (local, no timezone drift)
const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`; // m is 1-based
const addMonths = (y, m, n) => { const t = y * 12 + (m - 1) + n; return [Math.floor(t / 12), (t % 12) + 1]; };
const today = new Date();
const START = addMonths(today.getFullYear(), today.getMonth() + 1, -11); // window of 12 months ending in the current month
const months = Array.from({ length: 12 }, (_, i) => addMonths(START[0], START[1], i));
const inPast = ([y, m], d) => new Date(y, m - 1, d) <= today;

const cents = (eur) => Math.round(eur * 100);
const summer = (m) => [6, 7, 8, 9].includes(m);
const winter = (m) => [12, 1, 2].includes(m);

// ---- one Firebase app per user so each write is authenticated as that user
const clients = new Map();
function client(email) {
  if (!clients.has(email)) {
    const app = initializeApp(CONFIG, email);
    const auth = getAuth(app);
    const db = getFirestore(app);
    const storage = getStorage(app);
    if (EMULATOR) {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectFirestoreEmulator(db, '127.0.0.1', 8080);
      connectStorageEmulator(storage, '127.0.0.1', 9199);
    }
    clients.set(email, { auth, db, storage });
  }
  return clients.get(email);
}

/** Signs up (or signs in if the account exists) and makes sure the users/{uid} profile document exists. */
async function login({ email, name }, password, accountRole) {
  const c = client(email);
  try {
    const cred = await createUserWithEmailAndPassword(c.auth, email, password);
    await updateProfile(cred.user, { displayName: name });
  } catch (e) {
    if (e.code !== 'auth/email-already-in-use') throw e;
    await signInWithEmailAndPassword(c.auth, email, password);
  }
  const uid = c.auth.currentUser.uid;
  const userRef = doc(c.db, 'users', uid);
  if (!(await getDoc(userRef)).exists()) {
    await setDoc(userRef, {
      email, displayName: name, photoPath: null, accountRole, locale: 'es', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
  }
  return { ...c, uid, email, name };
}

const memberDoc = (u, houseId, over) => ({
  uid: u.uid, role: 'ROOMMATE', status: 'ACTIVE', joinedAt: serverTimestamp(), removedAt: null, individualContributionCents: null,
  displayName: u.name, email: u.email, photoPath: null, inviteCode: null, ...over,
});

async function invoicePdf({ house, category, amountCents, chargeDate, periodStart, periodEnd, number, tenant }) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.1, 0.12);
  const grey = rgb(0.45, 0.45, 0.5);
  const text = (t, x, y, size = 11, f = font, color = ink) => page.drawText(t, { x, y, size, font: f, color });
  page.drawRectangle({ x: 0, y: 772, width: 595, height: 70, color: rgb(0, 0.48, 1) });
  text(PROVIDERS[category], 40, 800, 20, bold, rgb(1, 1, 1));
  text('FACTURA', 450, 800, 20, bold, rgb(1, 1, 1));
  text(`Nº ${number}`, 40, 740, 11, bold);
  text(`Fecha de emisión: ${chargeDate}`, 40, 724, 10, font, grey);
  text('Cliente', 40, 690, 10, font, grey);
  text(tenant, 40, 674, 12, bold);
  text(house.name, 40, 658, 11);
  text(house.address, 40, 643, 10, font, grey);
  if (periodStart && periodEnd) text(`Periodo facturado: ${periodStart} a ${periodEnd}`, 40, 610, 11);
  page.drawLine({ start: { x: 40, y: 580 }, end: { x: 555, y: 580 }, thickness: 0.7, color: grey });
  text('Concepto', 40, 562, 10, bold);
  text('Importe', 480, 562, 10, bold);
  const base = Math.round(amountCents / 1.21);
  const vat = amountCents - base;
  const eur = (c) => `${(c / 100).toFixed(2).replace('.', ',')} €`;
  text(category === 'Alquiler' ? 'Alquiler de vivienda habitual' : `Suministro / servicio: ${category}`, 40, 540, 11);
  text(eur(base), 480, 540, 11);
  text('IVA (21 %)', 40, 520, 11);
  text(eur(vat), 480, 520, 11);
  page.drawLine({ start: { x: 40, y: 500 }, end: { x: 555, y: 500 }, thickness: 0.7, color: grey });
  text('TOTAL', 40, 478, 14, bold);
  text(eur(amountCents), 460, 478, 14, bold);
  text('Pago por domiciliación bancaria. Documento de demostración generado para Costos Piso.', 40, 60, 9, font, grey);
  return pdf.save();
}

// ---- data model per category
function categoriesFor(h) {
  const [ay, am] = months[0];
  return [
    { name: 'Alquiler', icon: 'home', color: '#007AFF', amountType: 'FIXED', expectedAmountCents: h.rent, intervalUnit: 'MONTH', intervalCount: 1, anchorDate: iso(ay, am, 1) },
    { name: 'Luz', icon: 'flash', color: '#FF9500', amountType: 'VARIABLE', expectedAmountCents: 7500, intervalUnit: 'MONTH', intervalCount: 1, anchorDate: iso(ay, am, 12) },
    { name: 'Internet', icon: 'wifi', color: '#5856D6', amountType: 'FIXED', expectedAmountCents: h.internet, intervalUnit: 'MONTH', intervalCount: 1, anchorDate: iso(ay, am, 5) },
    { name: 'Teléfono', icon: 'call', color: '#34C759', amountType: 'VARIABLE', expectedAmountCents: 3800, intervalUnit: 'MONTH', intervalCount: 1, anchorDate: iso(ay, am, 20) },
    { name: 'Gas', icon: 'flame', color: '#FF3B30', amountType: 'VARIABLE', expectedAmountCents: 6000, intervalUnit: 'MONTH', intervalCount: 2, anchorDate: iso(ay, am, 15) },
    { name: 'Limpieza', icon: 'sparkles', color: '#5AC8FA', amountType: 'FIXED', expectedAmountCents: 6000, intervalUnit: 'MONTH', intervalCount: 1, anchorDate: iso(ay, am, 28) },
    { name: 'Agua', icon: 'water', color: '#32ADE6', amountType: 'VARIABLE', expectedAmountCents: 4800, intervalUnit: 'MONTH', intervalCount: 2, anchorDate: iso(...addMonths(ay, am, 1), 8) },
  ];
}

/** Bills for one house over the 12 months. */
function billsFor(h) {
  const out = [];
  months.forEach(([y, m], i) => {
    const bill = (category, amountCents, day, period = null) => {
      if (!inPast([y, m], day)) return;
      out.push({ category, amountCents, chargeDate: iso(y, m, day), periodStart: period?.[0] ?? null, periodEnd: period?.[1] ?? null });
    };
    const prev = addMonths(y, m, -1);
    bill('Alquiler', h.rent, 1);
    bill('Internet', h.internet, 5);
    bill('Limpieza', 6000, 28);
    // Electricity: AC in summer, heating in winter.
    const luz = 55 + (summer(m) ? between(35, 60) : winter(m) ? between(20, 40) : between(0, 12));
    bill('Luz', cents(luz), 12, [iso(prev[0], prev[1], 12), iso(y, m, 11)]);
    bill('Teléfono', cents(between(31, 49)), 20, [iso(prev[0], prev[1], 20), iso(y, m, 19)]);
    // Gas every 2 months, high in winter.
    if (i % 2 === 0) {
      const p2 = addMonths(y, m, -2);
      const gas = winter(m) || m === 11 || m === 3 ? between(85, 125) : summer(m) ? between(18, 28) : between(35, 55);
      bill('Gas', cents(gas), 15, [iso(p2[0], p2[1], 15), iso(y, m, 14)]);
    }
    // Water every 2 months, offset by one month, higher in summer.
    if (i % 2 === 1) {
      const p2 = addMonths(y, m, -2);
      bill('Agua', cents(summer(m) ? between(52, 72) : between(36, 50)), 8, [iso(p2[0], p2[1], 8), iso(y, m, 7)]);
    }
  });
  return out;
}

async function inChunks(items, size, fn) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

async function seedHouse(h, creds) {
  console.log(`\n=== ${h.name}`);
  const admin = await login(h.admin, creds[h.admin.email].password, 'ADMIN');
  const existing = await getDocs(query(collectionGroup(admin.db, 'members'), where('uid', '==', admin.uid), limit(1)));
  let houseId;
  const catIds = {};
  const memberIds = [];
  if (!existing.empty) {
    // Resume a house created by an interrupted run: reuse categories/members, add bills only if there are none.
    houseId = existing.docs[0].ref.parent.parent.id;
    const bs = await getDocs(query(collection(admin.db, 'houses', houseId, 'bills'), limit(1)));
    if (!bs.empty) { console.log('  already fully seeded, skipping'); return; }
    (await getDocs(collection(admin.db, 'houses', houseId, 'categories'))).forEach((d) => { catIds[d.data().name] = d.id; });
    (await getDocs(collection(admin.db, 'houses', houseId, 'members'))).forEach((d) => { if (d.data().role === 'ROOMMATE') memberIds.push(d.id); });
    console.log(`  resuming existing house (${Object.keys(catIds).length} categories, ${memberIds.length} roommates)`);
  } else {
  houseId = randomUUID();
  const hb = writeBatch(admin.db);
  hb.set(doc(admin.db, 'houses', houseId), {
    name: h.name, address: h.address, currency: 'EUR', splitMode: h.splitMode, fixedContributionCents: h.fixed ?? null,
    contributionDayOfMonth: h.fixed ? 5 : null, showBalanceToRoommates: true, createdBy: admin.uid,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  hb.set(doc(admin.db, 'houses', houseId, 'members', admin.uid), memberDoc(admin, houseId, { role: 'ADMIN' }));
  await hb.commit();
  console.log('  house created');

  const cats = categoriesFor(h);
  for (const [i, c] of cats.entries()) {
    const id = randomUUID();
    catIds[c.name] = id;
    await setDoc(doc(admin.db, 'houses', houseId, 'categories', id), {
      ...c, isActive: true, sortOrder: i, notes: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
  }
  console.log(`  ${cats.length} categories`);

  // Roommates join through real invite codes (member doc + usedCount increment in one batch).
  for (const r of h.roommates) {
    const code = genCode();
    await setDoc(doc(admin.db, 'invites', code), {
      houseId, status: 'ACTIVE', expiresAt: Timestamp.fromMillis(Date.now() + 7 * 864e5), maxUses: 1, usedCount: 0,
      createdBy: admin.uid, createdAt: serverTimestamp(),
    });
    const ru = await login(r, creds[r.email].password, 'ROOMMATE');
    const invite = await getDoc(doc(ru.db, 'invites', code));
    const rb = writeBatch(ru.db);
    rb.set(doc(ru.db, 'houses', invite.data().houseId, 'members', ru.uid), memberDoc(ru, houseId, { inviteCode: code }));
    rb.update(doc(ru.db, 'invites', code), { usedCount: increment(1) });
    await rb.commit();
    memberIds.push(ru.uid);
    console.log(`  ${r.name} joined`);
  }
  }

  // Bills with PDF invoices.
  const bills = billsFor(h);
  let n = 0;
  await inChunks(bills.map((b) => ({ ...b, n: ++n })), 6, async (b) => {
    const id = randomUUID();
    const number = `${b.category.slice(0, 3).toUpperCase()}-${b.chargeDate.replace(/-/g, '')}-${pad(b.n)}`;
    const fileName = `${b.category.toLowerCase().replace('é', 'e')}-${b.chargeDate}.pdf`;
    const path = `houses/${houseId}/bills/${id}/${fileName}`;
    const bytes = await invoicePdf({ house: h, category: b.category, amountCents: b.amountCents, chargeDate: b.chargeDate, periodStart: b.periodStart, periodEnd: b.periodEnd, number, tenant: h.admin.name });
    await uploadBytes(ref(admin.storage, path), bytes, { contentType: 'application/pdf' });
    await setDoc(doc(admin.db, 'houses', houseId, 'bills', id), {
      categoryId: catIds[b.category], amountCents: b.amountCents, chargeDate: b.chargeDate, periodStartDate: b.periodStart,
      periodEndDate: b.periodEnd, effectiveDate: b.chargeDate, fileStoragePath: path, fileName, fileMimeType: 'application/pdf',
      fileSizeBytes: bytes.length, notes: null, ocrStatus: 'NONE', ocrData: null, createdBy: admin.uid,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
  });
  console.log(`  ${bills.length} bills with PDFs`);

  // Fixed-contribution house: roommates pay every month; last month is partly pending.
  if (h.fixed) {
    const payments = [];
    for (const [y, m] of months) {
      for (const [ri, memberId] of memberIds.entries()) {
        const pendingMonth = y === months[10][0] && m === months[10][1];
        if (pendingMonth && ri === 1) continue;
        if (new Date(y, m - 1, 5) > today) continue;
        payments.push({ memberId, month: iso(y, m, 1), note: payments.length % 5 === 0 ? 'Bizum' : null });
      }
    }
    await inChunks(payments, 10, (p) =>
      setDoc(doc(collection(admin.db, 'houses', houseId, 'payments')), {
        memberId: p.memberId, month: p.month, amountCents: h.fixed, note: p.note, paidAt: serverTimestamp(), recordedBy: admin.uid,
      }),
    );
    console.log(`  ${payments.length} payments`);
  }
}

async function main() {
  console.log(EMULATOR ? 'Target: LOCAL EMULATORS (demo-costos)' : 'Target: PRODUCTION project costos-piso');
  const creds = existsSync(CRED_FILE) ? JSON.parse(readFileSync(CRED_FILE, 'utf8')) : {};
  for (const u of HOUSES.flatMap((h) => [h.admin, ...h.roommates])) creds[u.email] ??= { name: u.name, password: genPassword() };
  writeFileSync(CRED_FILE, JSON.stringify(creds, null, 2)); // save first: accounts may be created before a later failure

  for (const h of HOUSES) await seedHouse(h, creds);

  console.log(`\nCredentials saved to ${CRED_FILE.pathname.split('/').pop()}\n`);
  for (const [email, c] of Object.entries(creds)) console.log(`${c.name.padEnd(14)} ${email.padEnd(32)} ${c.password}`);
  process.exit(0); // Firebase clients keep sockets open
}

main().catch((e) => { console.error(e); process.exit(1); });
