/**
 * Firestore data layer. Every `api.*` function keeps the name/signature of the former Data Connect client,
 * so hooks and screens are unchanged. See docs/firestore-model.md for the document model and
 * firestore.rules for the server-side authorization that actually protects the data (this client code is
 * NOT a security boundary).
 *
 * Cost notes: one-shot reads only (no listeners), bounded queries, dates stored as ISO strings so a single
 * range query serves each screen.
 */
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales';
import {
  type DocumentData,
  type QueryDocumentSnapshot,
  type Query,
  type Timestamp,
  type WriteBatch,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp as FsTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

import type {
  AmountType,
  Bill,
  DocumentType,
  ExpenseCategory,
  House,
  HouseInvite,
  HouseMember,
  HouseRole,
  IntervalUnit,
  Locale,
  MemberPayment,
  SplitMode,
  User,
  UserDocument,
} from '@/types/domain';

import { auth, db } from './firebase';
import { deleteFile } from './storage';

// ---------- helpers ----------
function requireUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  return uid;
}

const iso = (t: Timestamp | null | undefined): string => (t ? t.toDate().toISOString() : '');
const isoOrNull = (t: Timestamp | null | undefined): string | null => (t ? t.toDate().toISOString() : null);

/** Drops `undefined` values (Firestore rejects them); `null` is kept (it clears a field). */
function defined<T extends Record<string, unknown>>(v: T): Partial<T> {
  return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined)) as Partial<T>;
}

const todayIso = (): string => new Date().toISOString().slice(0, 10);

/** Hard cap on documents returned by any list query (cost guard). */
const MAX_LIST = 2000;
const BATCH_SIZE = 400;

const isPermissionDenied = (e: unknown): boolean => (e as { code?: string }).code === 'permission-denied';

async function deleteInBatches(docs: QueryDocumentSnapshot[]): Promise<void> {
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    docs.slice(i, i + BATCH_SIZE).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

async function deleteQuery(q: Query<DocumentData>): Promise<QueryDocumentSnapshot[]> {
  const snap = await getDocs(q);
  await deleteInBatches(snap.docs);
  return snap.docs;
}

// ---------- document shapes ----------
const houseDoc = (houseId: string) => doc(db, 'houses', houseId);
const memberDoc = (houseId: string, uid: string) => doc(db, 'houses', houseId, 'members', uid);
const membersCol = (houseId: string) => collection(db, 'houses', houseId, 'members');
const categoriesCol = (houseId: string) => collection(db, 'houses', houseId, 'categories');
const billsCol = (houseId: string) => collection(db, 'houses', houseId, 'bills');
const paymentsCol = (houseId: string) => collection(db, 'houses', houseId, 'payments');

const mapMember = (d: QueryDocumentSnapshot<DocumentData>): HouseMember => {
  const m = d.data();
  return {
    id: d.id,
    userId: d.id,
    displayName: m.displayName,
    email: m.email,
    photoPath: m.photoPath ?? null,
    role: m.role,
    status: m.status,
    joinedAt: iso(m.joinedAt),
    removedAt: isoOrNull(m.removedAt),
    individualContributionCents: m.individualContributionCents ?? null,
  };
};

const mapHouse = (id: string, h: DocumentData): House => ({
  id,
  name: h.name,
  address: h.address ?? null,
  currency: h.currency,
  splitMode: h.splitMode,
  fixedContributionCents: h.fixedContributionCents ?? null,
  contributionDayOfMonth: h.contributionDayOfMonth ?? null,
  showBalanceToRoommates: h.showBalanceToRoommates ?? true,
});

const mapBill = (id: string, b: DocumentData): Bill => ({
  id,
  categoryId: b.categoryId,
  amountCents: b.amountCents,
  chargeDate: b.chargeDate ?? null,
  periodStartDate: b.periodStartDate ?? null,
  periodEndDate: b.periodEndDate ?? null,
  fileStoragePath: b.fileStoragePath ?? null,
  fileName: b.fileName ?? null,
  fileMimeType: b.fileMimeType ?? null,
  fileSizeBytes: b.fileSizeBytes ?? null,
  notes: b.notes ?? null,
  ocrStatus: b.ocrStatus,
  ocrData: b.ocrData ?? null,
  createdAt: iso(b.createdAt),
});

const mapCategory = (id: string, c: DocumentData): ExpenseCategory => ({
  id,
  name: c.name,
  icon: c.icon,
  color: c.color,
  amountType: c.amountType,
  expectedAmountCents: c.expectedAmountCents ?? null,
  intervalUnit: c.intervalUnit,
  intervalCount: c.intervalCount,
  anchorDate: c.anchorDate,
  isActive: c.isActive,
  sortOrder: c.sortOrder,
  notes: c.notes ?? null,
});

// ---------- input shapes ----------
export type HouseWithRole = House & { role: HouseRole };

export interface CreateHouseInput {
  id: string;
  name: string;
  address?: string | null;
  splitMode?: SplitMode;
  fixedContributionCents?: number | null;
  contributionDayOfMonth?: number | null;
  showBalanceToRoommates?: boolean;
}
export type UpdateHouseInput = Partial<Omit<CreateHouseInput, 'id'>> & { houseId: string };

export interface CategoryInput {
  name: string;
  icon: string;
  color: string;
  amountType: AmountType;
  expectedAmountCents?: number | null;
  intervalUnit: IntervalUnit;
  intervalCount: number;
  anchorDate: string;
  isActive?: boolean;
  sortOrder?: number;
  notes?: string | null;
}

export interface BillInput {
  categoryId: string;
  amountCents: number;
  chargeDate?: string | null;
  periodStartDate?: string | null;
  periodEndDate?: string | null;
  fileStoragePath?: string | null;
  fileName?: string | null;
  fileMimeType?: string | null;
  fileSizeBytes?: number | null;
  notes?: string | null;
}

/** Current user's profile, used to denormalize name/email/photo into member documents. */
async function myProfile(uid: string): Promise<{ displayName: string; email: string; photoPath: string | null }> {
  const snap = await getDoc(doc(db, 'users', uid));
  const u = snap.data();
  return {
    displayName: u?.displayName || auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || 'Roommie',
    email: u?.email ?? auth.currentUser?.email ?? '',
    photoPath: u?.photoPath ?? null,
  };
}

async function myMemberships(uid: string): Promise<QueryDocumentSnapshot[]> {
  return (await getDocs(query(collectionGroup(db, 'members'), where('uid', '==', uid), limit(50)))).docs;
}

// ---------- public API ----------
export const api = {
  // User
  upsertUser: async (v: { email: string; displayName: string; locale?: Locale; accountRole?: HouseRole }): Promise<void> => {
    const uid = requireUid();
    const ref = doc(db, 'users', uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        ...defined({ email: v.email, displayName: v.displayName, locale: v.locale, accountRole: v.accountRole }),
        updatedAt: serverTimestamp(),
      });
      return;
    }
    await setDoc(ref, {
      email: v.email,
      displayName: v.displayName,
      photoPath: null,
      accountRole: v.accountRole ?? 'ROOMMATE',
      locale: v.locale ?? 'es',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  },
  getMe: async (): Promise<User | null> => {
    const uid = requireUid();
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    const u = snap.data();
    return {
      id: uid,
      email: u.email,
      displayName: u.displayName,
      photoPath: u.photoPath ?? null,
      accountRole: u.accountRole,
      locale: isLocale(u.locale) ? u.locale : DEFAULT_LOCALE,
    };
  },
  updateMyProfile: async (v: { displayName?: string; photoPath?: string | null; locale?: Locale; accountRole?: HouseRole }): Promise<void> => {
    const uid = requireUid();
    await updateDoc(doc(db, 'users', uid), { ...defined(v), updatedAt: serverTimestamp() });
    // Keep the denormalized copy in each house membership in sync (one small batch).
    if (v.displayName !== undefined || v.photoPath !== undefined) {
      const memberships = await myMemberships(uid);
      if (memberships.length) {
        const batch = writeBatch(db);
        memberships.forEach((m) => batch.update(m.ref, defined({ displayName: v.displayName, photoPath: v.photoPath })));
        await batch.commit();
      }
    }
  },
  listMyDocuments: async (): Promise<UserDocument[]> => {
    const uid = requireUid();
    const snap = await getDocs(query(collection(db, 'users', uid, 'documents'), orderBy('uploadedAt', 'desc'), limit(50)));
    return snap.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        type: x.type,
        storagePath: x.storagePath,
        fileName: x.fileName,
        mimeType: x.mimeType,
        sizeBytes: x.sizeBytes,
        uploadedAt: iso(x.uploadedAt),
      };
    });
  },
  addMyDocument: async (v: { id: string; type: DocumentType; storagePath: string; fileName: string; mimeType: string; sizeBytes: number }): Promise<void> => {
    const uid = requireUid();
    await setDoc(doc(db, 'users', uid, 'documents', v.id), {
      type: v.type,
      storagePath: v.storagePath,
      fileName: v.fileName,
      mimeType: v.mimeType,
      sizeBytes: v.sizeBytes,
      uploadedAt: serverTimestamp(),
    });
  },
  deleteMyDocument: async (v: { id: string }): Promise<void> => {
    await deleteDoc(doc(db, 'users', requireUid(), 'documents', v.id));
  },
  /**
   * Identity documents are strictly owner-only (Firestore + Storage rules cannot express "admin of a house
   * the owner belongs to" without Cloud Functions/custom claims), so admins get an empty list.
   * See README "Security model" for the follow-up.
   */
  listMemberDocuments: async (_v: { houseId: string; userId: string }): Promise<UserDocument[]> => [],
  /**
   * Account deletion: removes identity documents, leaves houses where the user is a roommate and
   * anonymises the denormalized member copies. Houses where the user is the ADMIN are left untouched
   * (delete or hand over the house first).
   */
  deleteMyAccountData: async (): Promise<void> => {
    const uid = requireUid();
    const docs = await getDocs(collection(db, 'users', uid, 'documents'));
    await deleteInBatches(docs.docs);
    const memberships = await myMemberships(uid);
    for (let i = 0; i < memberships.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      memberships.slice(i, i + BATCH_SIZE).forEach((m) => {
        const x = m.data();
        if (x.role === 'ROOMMATE' && x.status === 'ACTIVE') {
          batch.update(m.ref, { status: 'REMOVED', removedAt: serverTimestamp() });
        }
      });
      await batch.commit();
    }
    const anon = writeBatch(db);
    memberships.forEach((m) => anon.update(m.ref, { displayName: 'Cuenta eliminada', email: '', photoPath: null }));
    // Anonymising and leaving must be separate writes: the rules only allow one kind of self-update at a time.
    if (memberships.length) await anon.commit();
    await deleteDoc(doc(db, 'users', uid));
  },

  // Houses
  createHouse: async (v: CreateHouseInput): Promise<void> => {
    const uid = requireUid();
    const profile = await myProfile(uid);
    const batch = writeBatch(db);
    batch.set(houseDoc(v.id), {
      name: v.name,
      address: v.address ?? null,
      currency: 'EUR',
      splitMode: v.splitMode ?? 'EQUAL',
      fixedContributionCents: v.fixedContributionCents ?? null,
      contributionDayOfMonth: v.contributionDayOfMonth ?? null,
      showBalanceToRoommates: v.showBalanceToRoommates ?? true,
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(memberDoc(v.id, uid), {
      uid,
      role: 'ADMIN',
      status: 'ACTIVE',
      joinedAt: serverTimestamp(),
      removedAt: null,
      individualContributionCents: null,
      ...profile,
      inviteCode: null,
    });
    await batch.commit();
  },
  updateHouse: async ({ houseId, ...rest }: UpdateHouseInput): Promise<void> => {
    await updateDoc(houseDoc(houseId), { ...defined(rest), updatedAt: serverTimestamp() });
  },
  listMyHouses: async (): Promise<HouseWithRole[]> => {
    const uid = requireUid();
    const memberships = (await myMemberships(uid)).filter((m) => m.data().status === 'ACTIVE');
    const houses = await Promise.all(
      memberships.map(async (m) => {
        const houseId = m.ref.parent.parent?.id;
        if (!houseId) return null;
        const snap = await getDoc(houseDoc(houseId));
        return snap.exists() ? { ...mapHouse(houseId, snap.data()), role: m.data().role as HouseRole } : null;
      }),
    );
    return houses.filter((h): h is HouseWithRole => h !== null);
  },
  getHouse: async (v: { houseId: string }): Promise<{ house: House; members: HouseMember[] } | null> => {
    const [house, members] = await Promise.all([
      getDoc(houseDoc(v.houseId)),
      getDocs(query(membersCol(v.houseId), orderBy('joinedAt', 'asc'), limit(100))),
    ]);
    if (!house.exists()) return null;
    return { house: mapHouse(house.id, house.data()), members: members.docs.map(mapMember) };
  },
  /** Admin only. Children first (rules need your admin membership to still exist), then the house, then you. */
  deleteHouse: async (v: { houseId: string }): Promise<void> => {
    const uid = requireUid();
    const { houseId } = v;
    const bills = await getDocs(billsCol(houseId));
    await Promise.all(
      bills.docs.map((b) => {
        const path = b.data().fileStoragePath as string | null;
        return path ? deleteFile(path).catch(() => undefined) : undefined;
      }),
    );
    await deleteInBatches(bills.docs);
    await deleteQuery(paymentsCol(houseId));
    await deleteQuery(categoriesCol(houseId));
    await deleteQuery(query(collection(db, 'invites'), where('houseId', '==', houseId)));
    const members = await getDocs(membersCol(houseId));
    await deleteInBatches(members.docs.filter((m) => m.id !== uid && m.data().role === 'ROOMMATE'));
    const last = writeBatch(db);
    last.delete(houseDoc(houseId));
    last.delete(memberDoc(houseId, uid));
    await last.commit();
  },

  // Members & invites
  createInvite: async (v: { houseId: string; code: string; expiresAt: string; maxUses: number }): Promise<void> => {
    await setDoc(doc(db, 'invites', v.code), {
      houseId: v.houseId,
      status: 'ACTIVE',
      expiresAt: FsTimestamp.fromDate(new Date(v.expiresAt)),
      maxUses: v.maxUses,
      usedCount: 0,
      createdBy: requireUid(),
      createdAt: serverTimestamp(),
    });
  },
  revokeInvite: async (v: { houseId: string; inviteId: string }): Promise<void> => {
    await updateDoc(doc(db, 'invites', v.inviteId), { status: 'REVOKED' });
  },
  listInvites: async (v: { houseId: string }): Promise<HouseInvite[]> => {
    try {
      const snap = await getDocs(
        query(collection(db, 'invites'), where('houseId', '==', v.houseId), orderBy('createdAt', 'desc'), limit(50)),
      );
      return snap.docs.map((d) => {
        const x = d.data();
        const expired = x.status === 'ACTIVE' && x.expiresAt.toDate() < new Date();
        return {
          id: d.id,
          code: d.id,
          status: expired ? 'EXPIRED' : x.status,
          expiresAt: iso(x.expiresAt),
          maxUses: x.maxUses,
          usedCount: x.usedCount,
        };
      });
    } catch (e) {
      if (isPermissionDenied(e)) return []; // roommates
      throw e;
    }
  },
  /** Joins the invite's house as ROOMMATE. One batch: member document + usedCount increment (validated by rules). */
  redeemInvite: async (v: { code: string }): Promise<void> => {
    const uid = requireUid();
    const inviteRef = doc(db, 'invites', v.code);
    const invite = await getDoc(inviteRef);
    if (!invite.exists()) throw new Error('Invalid invite code');
    const inv = invite.data();
    if (inv.status !== 'ACTIVE') throw new Error('Invite is no longer active');
    if (inv.expiresAt.toDate() < new Date()) throw new Error('Invite has expired');
    if (inv.usedCount >= inv.maxUses) throw new Error('Invite has no uses left');
    const profile = await myProfile(uid);
    const batch: WriteBatch = writeBatch(db);
    batch.set(memberDoc(inv.houseId, uid), {
      uid,
      role: 'ROOMMATE',
      status: 'ACTIVE',
      joinedAt: serverTimestamp(),
      removedAt: null,
      individualContributionCents: null,
      ...profile,
      inviteCode: v.code,
    });
    batch.update(inviteRef, { usedCount: increment(1) });
    await batch.commit();
  },
  removeMember: async (v: { houseId: string; memberId: string }): Promise<void> => {
    await updateDoc(memberDoc(v.houseId, v.memberId), { status: 'REMOVED', removedAt: serverTimestamp() });
  },
  reactivateMember: async (v: { houseId: string; memberId: string }): Promise<void> => {
    await updateDoc(memberDoc(v.houseId, v.memberId), { status: 'ACTIVE', removedAt: null });
  },
  setMemberContribution: async (v: { houseId: string; memberId: string; individualContributionCents: number | null }): Promise<void> => {
    await updateDoc(memberDoc(v.houseId, v.memberId), { individualContributionCents: v.individualContributionCents });
  },
  leaveHouse: async (v: { houseId: string }): Promise<void> => {
    await updateDoc(memberDoc(v.houseId, requireUid()), { status: 'REMOVED', removedAt: serverTimestamp() });
  },
  listMembers: async (v: { houseId: string }): Promise<HouseMember[]> =>
    (await getDocs(query(membersCol(v.houseId), orderBy('joinedAt', 'asc'), limit(100)))).docs.map(mapMember),

  // Categories
  createCategory: async (v: CategoryInput & { houseId: string; id: string }): Promise<void> => {
    await setDoc(doc(categoriesCol(v.houseId), v.id), {
      name: v.name,
      icon: v.icon,
      color: v.color,
      amountType: v.amountType,
      expectedAmountCents: v.expectedAmountCents ?? null,
      intervalUnit: v.intervalUnit,
      intervalCount: v.intervalCount,
      anchorDate: v.anchorDate,
      isActive: v.isActive ?? true,
      sortOrder: v.sortOrder ?? 0,
      notes: v.notes ?? null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  },
  updateCategory: async ({ houseId, id, ...rest }: Partial<CategoryInput> & { houseId: string; id: string }): Promise<void> => {
    await updateDoc(doc(categoriesCol(houseId), id), { ...defined(rest), updatedAt: serverTimestamp() });
  },
  archiveCategory: async (v: { houseId: string; id: string; isActive: boolean }): Promise<void> => {
    await updateDoc(doc(categoriesCol(v.houseId), v.id), { isActive: v.isActive, updatedAt: serverTimestamp() });
  },
  listCategories: async (v: { houseId: string }): Promise<ExpenseCategory[]> => {
    const snap = await getDocs(query(categoriesCol(v.houseId), orderBy('sortOrder', 'asc'), limit(200)));
    return snap.docs.map((d) => mapCategory(d.id, d.data())).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  },
  setCategorySortOrder: async (v: { houseId: string; id: string; sortOrder: number }): Promise<void> => {
    await updateDoc(doc(categoriesCol(v.houseId), v.id), { sortOrder: v.sortOrder, updatedAt: serverTimestamp() });
  },

  // Bills
  createBill: async (v: BillInput & { houseId: string; id: string }): Promise<void> => {
    await setDoc(doc(billsCol(v.houseId), v.id), {
      categoryId: v.categoryId,
      amountCents: v.amountCents,
      chargeDate: v.chargeDate ?? null,
      periodStartDate: v.periodStartDate ?? null,
      periodEndDate: v.periodEndDate ?? null,
      // Effective date rule: chargeDate, else periodEndDate, else the creation date.
      effectiveDate: v.chargeDate ?? v.periodEndDate ?? todayIso(),
      fileStoragePath: v.fileStoragePath ?? null,
      fileName: v.fileName ?? null,
      fileMimeType: v.fileMimeType ?? null,
      fileSizeBytes: v.fileSizeBytes ?? null,
      notes: v.notes ?? null,
      // TODO(ocr): a Cloud Function on Storage upload will set PENDING/DONE and fill ocrData.
      ocrStatus: 'NONE',
      ocrData: null,
      createdBy: requireUid(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  },
  updateBill: async ({ houseId, id, ...rest }: Partial<BillInput> & { houseId: string; id: string }): Promise<void> => {
    const ref = doc(billsCol(houseId), id);
    const patch = defined(rest);
    const touchesDates = 'chargeDate' in patch || 'periodEndDate' in patch;
    const extra: Record<string, unknown> = {};
    if (touchesDates) {
      const current = (await getDoc(ref)).data();
      if (!current) throw new Error('Bill not found');
      const chargeDate = 'chargeDate' in patch ? patch.chargeDate : current.chargeDate;
      const periodEndDate = 'periodEndDate' in patch ? patch.periodEndDate : current.periodEndDate;
      extra.effectiveDate = chargeDate ?? periodEndDate ?? iso(current.createdAt).slice(0, 10);
    }
    await updateDoc(ref, { ...patch, ...extra, updatedAt: serverTimestamp() });
  },
  deleteBill: async (v: { houseId: string; id: string }): Promise<void> => {
    await deleteDoc(doc(billsCol(v.houseId), v.id));
  },
  getBill: async (v: { houseId: string; id: string }): Promise<Bill | null> => {
    const snap = await getDoc(doc(billsCol(v.houseId), v.id));
    return snap.exists() ? mapBill(snap.id, snap.data()) : null;
  },
  /** Bills whose EFFECTIVE date falls within [from, to] (inclusive ISO dates), newest first. Capped at MAX_LIST. */
  listBills: async (v: { houseId: string; from: string; to: string; categoryId?: string }): Promise<Bill[]> => {
    const constraints = [
      where('effectiveDate', '>=', v.from),
      where('effectiveDate', '<=', v.to),
      ...(v.categoryId ? [where('categoryId', '==', v.categoryId)] : []),
      orderBy('effectiveDate', 'desc'),
      limit(MAX_LIST),
    ];
    const snap = await getDocs(query(billsCol(v.houseId), ...constraints));
    return snap.docs.map((d) => mapBill(d.id, d.data()));
  },

  // Payments
  recordPayment: async (v: { houseId: string; id: string; memberId: string; month: string; amountCents: number; note?: string | null }): Promise<void> => {
    await setDoc(doc(paymentsCol(v.houseId), v.id), {
      memberId: v.memberId,
      month: v.month,
      amountCents: v.amountCents,
      note: v.note ?? null,
      paidAt: serverTimestamp(),
      recordedBy: requireUid(),
    });
  },
  deletePayment: async (v: { houseId: string; id: string }): Promise<void> => {
    await deleteDoc(doc(paymentsCol(v.houseId), v.id));
  },
  listPayments: async (v: { houseId: string; from: string; to: string }): Promise<MemberPayment[]> => {
    const snap = await getDocs(
      query(paymentsCol(v.houseId), where('month', '>=', v.from), where('month', '<=', v.to), orderBy('month', 'desc'), limit(MAX_LIST)),
    );
    return snap.docs.map((d) => {
      const p = d.data();
      return { id: d.id, memberId: p.memberId, month: p.month, amountCents: p.amountCents, paidAt: iso(p.paidAt), note: p.note ?? null };
    });
  },
};
