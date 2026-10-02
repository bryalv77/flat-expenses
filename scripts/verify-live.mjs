// Read-only/negative checks of the deployed rules, as the demo users. Writes are only attempted to prove they are denied.
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { collection, collectionGroup, doc, getDoc, getDocs, getFirestore, limit, query, setDoc, where } from 'firebase/firestore';
import { getDownloadURL, getStorage, listAll, ref } from 'firebase/storage';

const cfg = { apiKey: 'AIzaSyA7La5uaZjWfCRQYglvVtQ5K8azOWZO-VU', authDomain: 'costos-piso.firebaseapp.com', projectId: 'costos-piso', storageBucket: 'costos-piso.firebasestorage.app' };
const creds = JSON.parse(readFileSync(new URL('./.demo-credentials.json', import.meta.url), 'utf8'));
let n = 0;
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) n++; };
const denied = async (p) => { try { await p; return false; } catch (e) { return /permission|unauthorized|PERMISSION/i.test(String(e.code ?? e.message)); } };

async function as(email) {
  const app = initializeApp(cfg, email);
  const auth = getAuth(app);
  const { user } = await signInWithEmailAndPassword(auth, email, creds[email].password);
  return { uid: user.uid, db: getFirestore(app), st: getStorage(app) };
}
async function houseOf(u) {
  const s = await getDocs(query(collectionGroup(u.db, 'members'), where('uid', '==', u.uid), limit(1)));
  return s.docs[0].ref.parent.parent.id;
}

const marta = await as('marta.admin@costospiso.demo');
const pablo = await as('pablo.roomie@costospiso.demo');
const javier = await as('javier.admin@costospiso.demo');
const hG = await houseOf(marta), hM = await houseOf(javier);

const bills = async (u, h) => (await getDocs(collection(u.db, 'houses', h, 'bills'))).size;
check('admin Marta reads her 67 bills', (await bills(marta, hG)) === 67);
check('roommate Pablo reads house bills', (await bills(pablo, hG)) === 67);
check('Pablo sees only his own house in memberships', (await houseOf(pablo)) === hG);
check('Pablo CANNOT read the other house', await denied(getDocs(collection(pablo.db, 'houses', hM, 'bills'))));
check('Marta CANNOT read the other house', await denied(getDoc(doc(marta.db, 'houses', hM))));
check('Pablo CANNOT list invites', await denied(getDocs(query(collection(pablo.db, 'invites'), where('houseId', '==', hG)))));
check('Pablo CANNOT create a bill', await denied(setDoc(doc(collection(pablo.db, 'houses', hG, 'bills')), { amountCents: 1 })));
check('Pablo CANNOT promote himself to admin', await denied(setDoc(doc(pablo.db, 'houses', hG, 'members', pablo.uid), { role: 'ADMIN' }, { merge: true })));
check('Pablo CANNOT edit the house', await denied(setDoc(doc(pablo.db, 'houses', hG), { name: 'hacked' }, { merge: true })));

const first = (await getDocs(query(collection(pablo.db, 'houses', hG, 'bills'), limit(1)))).docs[0].data();
check('Pablo can open a bill PDF of his house', typeof (await getDownloadURL(ref(pablo.st, first.fileStoragePath))) === 'string');
const other = (await getDocs(query(collection(javier.db, 'houses', hM, 'bills'), limit(1)))).docs[0].data();
check('Pablo CANNOT open a PDF of the other house', await denied(getDownloadURL(ref(pablo.st, other.fileStoragePath))));
check('Pablo CANNOT list Storage', await denied(listAll(ref(pablo.st, 'houses'))));
console.log(n ? `\n${n} FAILED` : '\nall checks passed');
process.exit(n ? 1 : 0);
