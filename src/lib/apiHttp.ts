import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales';
import type { Bill, BillFile, ExpenseCategory, House, HouseInvite, HouseMember, HouseRole, MemberPayment, User, UserDocument } from '@/types/domain';

import type { Api } from './api/types';
import { ApiError, qs, request } from './http';
import { normalizeIconName } from './iconAliases';

const fileOut = (f: { objectKey: string; fileName: string; mimeType: string; sizeBytes: number }): BillFile => ({
  storagePath: f.objectKey, fileName: f.fileName, mimeType: f.mimeType, sizeBytes: f.sizeBytes,
});
const fileIn = (f: BillFile) => ({ objectKey: f.storagePath, fileName: f.fileName, mimeType: f.mimeType, sizeBytes: f.sizeBytes });

const toHouse = (h: any): House => ({
  id: h.id, name: h.name, address: h.address ?? null, currency: h.currency, splitMode: h.splitMode,
  fixedContributionCents: h.fixedContributionCents ?? null, contributionDayOfMonth: h.contributionDayOfMonth ?? null,
  showBalanceToRoommates: h.showBalanceToRoommates ?? true,
});
const toMember = (m: any): HouseMember => ({
  id: m.userId, userId: m.userId, displayName: m.displayName ?? '', email: m.email ?? '', photoPath: m.photoKey ?? null,
  role: m.role, status: m.status, joinedAt: m.joinedAt, removedAt: m.removedAt ?? null,
  individualContributionCents: m.individualContributionCents ?? null,
});
const toCategory = (c: any): ExpenseCategory => ({
  id: c.id, name: c.name, icon: normalizeIconName(c.icon), color: c.color, amountType: c.amountType,
  expectedAmountCents: c.expectedAmountCents ?? null, intervalUnit: c.intervalUnit, intervalCount: c.intervalCount,
  anchorDate: c.anchorDate, isActive: c.isActive, sortOrder: c.sortOrder, notes: c.notes ?? null, names: c.names ?? null,
});
const toBill = (b: any): Bill => ({
  id: b.id, categoryId: b.categoryId, amountCents: b.amountCents, chargeDate: b.chargeDate ?? null,
  periodStartDate: b.periodStartDate ?? null, periodEndDate: b.periodEndDate ?? null,
  files: (b.files ?? []).map(fileOut), notes: b.notes ?? null, ocrStatus: b.ocrStatus, ocrData: b.ocrData ?? null, createdAt: b.createdAt,
});
const toInvite = (i: any): HouseInvite => ({
  id: i.code, code: i.code, status: i.status, expiresAt: i.expiresAt, maxUses: i.maxUses, usedCount: i.usedCount,
});
const toPayment = (p: any): MemberPayment => ({
  id: p.id, memberId: p.memberId, month: p.month, amountCents: p.amountCents, paidAt: p.paidAt, note: p.note ?? null,
});
const toDocument = (d: any): UserDocument => ({
  id: d.id, type: d.type, storagePath: d.objectKey, fileName: d.fileName, mimeType: d.mimeType, sizeBytes: d.sizeBytes, uploadedAt: d.uploadedAt,
});

const h = (houseId: string) => `/api/houses/${houseId}`;
const notFoundAsNull = async <T>(p: Promise<T>): Promise<T | null> =>
  p.catch((e) => {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  });

export const httpApi: Api = {
  // User. Better Auth owns the email; `upsertUser` only syncs the editable profile fields.
  upsertUser: async (v) => {
    await request('PATCH', '/api/me', { displayName: v.displayName, locale: v.locale, accountRole: v.accountRole });
  },
  getMe: async (): Promise<User | null> => {
    const u = await notFoundAsNull(request<any>('GET', '/api/me'));
    if (!u) return null;
    const role: HouseRole = u.accountRole === 'ADMIN' ? 'ADMIN' : 'ROOMMATE'; // new accounts start as 'USER'
    return { id: u.id, email: u.email, displayName: u.name, photoPath: u.photoKey ?? null, accountRole: role, locale: isLocale(u.locale) ? u.locale : DEFAULT_LOCALE };
  },
  updateMyProfile: async (v) => {
    await request('PATCH', '/api/me', { displayName: v.displayName, photoKey: v.photoPath, locale: v.locale, accountRole: v.accountRole });
  },
  listMyDocuments: async () => (await request<any[]>('GET', '/api/me/documents')).map(toDocument),
  addMyDocument: async (v) => {
    await request('POST', '/api/me/documents', { id: v.id, type: v.type, objectKey: v.storagePath, fileName: v.fileName, mimeType: v.mimeType, sizeBytes: v.sizeBytes });
  },
  deleteMyDocument: async (v) => request('DELETE', `/api/me/documents/${v.id}`),

  // Houses
  createHouse: async ({ id, ...rest }) => {
    await request('POST', '/api/houses', { id, ...rest });
  },
  updateHouse: async ({ houseId, ...rest }) => {
    await request('PATCH', h(houseId), rest);
  },
  listMyHouses: async () => (await request<any[]>('GET', '/api/houses')).map((x) => ({ ...toHouse(x), role: x.role as HouseRole })),
  getHouse: async (v) => {
    const r = await notFoundAsNull(request<{ house: any; members: any[] }>('GET', h(v.houseId)));
    return r && { house: toHouse(r.house), members: r.members.map(toMember) };
  },
  deleteHouse: async (v) => request('DELETE', h(v.houseId)), // the Worker also deletes the house's files

  // Members & invites
  createInvite: async ({ houseId, ...rest }) => {
    await request('POST', `${h(houseId)}/invites`, rest);
  },
  revokeInvite: async (v) => {
    await request('POST', `${h(v.houseId)}/invites/${v.inviteId}/revoke`);
  },
  listInvites: async (v) => {
    try {
      return (await request<any[]>('GET', `${h(v.houseId)}/invites`)).map(toInvite);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) return []; // roommates
      throw e;
    }
  },
  redeemInvite: async (v) => {
    try {
      await request('POST', '/api/invites/redeem', v);
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      const messages: Record<string, string> = {
        invalid_code: 'Invalid invite code',
        invite_unavailable: 'Invite is no longer active',
        already_member: 'Already a member of this house',
      };
      throw new Error(messages[e.message] ?? e.message);
    }
  },
  removeMember: async ({ houseId, memberId, removedAt }) => {
    await request('POST', `${h(houseId)}/members/${memberId}/remove`, { removedAt });
  },
  reactivateMember: async (v) => {
    await request('POST', `${h(v.houseId)}/members/${v.memberId}/reactivate`);
  },
  createGuestMember: async ({ houseId, ...rest }) => {
    await request('POST', `${h(houseId)}/members/guests`, rest);
  },
  setMemberContribution: async (v) => {
    await request('PATCH', `${h(v.houseId)}/members/${v.memberId}`, { individualContributionCents: v.individualContributionCents });
  },
  leaveHouse: async (v) => request('POST', `${h(v.houseId)}/leave`),
  listMembers: async (v) => (await request<any[]>('GET', `${h(v.houseId)}/members`)).map(toMember),

  // Categories. Delete rejects with message `CATEGORY_HAS_BILLS` (the server's error code), as before.
  createCategory: async ({ houseId, ...rest }) => {
    await request('POST', `${h(houseId)}/categories`, rest);
  },
  updateCategory: async ({ houseId, id, ...rest }) => {
    await request('PATCH', `${h(houseId)}/categories/${id}`, rest);
  },
  archiveCategory: async (v) => {
    await request('PATCH', `${h(v.houseId)}/categories/${v.id}`, { isActive: v.isActive });
  },
  deleteCategory: async (v) => request('DELETE', `${h(v.houseId)}/categories/${v.id}`),
  listCategories: async (v) => (await request<any[]>('GET', `${h(v.houseId)}/categories`)).map(toCategory),
  setCategorySortOrder: async (v) => {
    await request('PATCH', `${h(v.houseId)}/categories/${v.id}`, { sortOrder: v.sortOrder });
  },

  // Bills (files are uploaded first with uploadFile(), then referenced here)
  createBill: async ({ houseId, files, ...rest }) => {
    await request('POST', `${h(houseId)}/bills`, { ...rest, files: files?.map(fileIn) });
  },
  updateBill: async ({ houseId, id, files, ...rest }) => {
    await request('PATCH', `${h(houseId)}/bills/${id}`, { ...rest, files: files?.map(fileIn) });
  },
  deleteBill: async (v) => request('DELETE', `${h(v.houseId)}/bills/${v.id}`),
  getBill: async (v) => {
    const b = await notFoundAsNull(request<any>('GET', `${h(v.houseId)}/bills/${v.id}`));
    return b && toBill(b);
  },
  listBills: async (v) =>
    (await request<any[]>('GET', `${h(v.houseId)}/bills${qs({ from: v.from, to: v.to, categoryId: v.categoryId })}`)).map(toBill),

  // Payments
  recordPayment: async ({ houseId, ...rest }) => {
    await request('POST', `${h(houseId)}/payments`, rest);
  },
  deletePayment: async (v) => request('DELETE', `${h(v.houseId)}/payments/${v.id}`),
  listPayments: async (v) => (await request<any[]>('GET', `${h(v.houseId)}/payments${qs({ from: v.from, to: v.to })}`)).map(toPayment),
};
