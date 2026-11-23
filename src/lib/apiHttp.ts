import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales';
import type { Bill, BillFile, ExpenseCategory, House, HouseInvite, HouseMember, HouseRole, MemberPayment, User, UserDocument } from '@/types/domain';

import * as sdk from './api/generated/sdk.gen';
import type * as Wire from './api/generated/types.gen';
import type { Api } from './api/types';
import './apiClient';
import { ApiError } from './http';
import { normalizeIconName } from './iconAliases';

// The wire shapes come from openapi.yaml; the mappers below turn them into the app's domain types.
const fileOut = (f: Wire.BillFile): BillFile => ({
  storagePath: f.objectKey, fileName: f.fileName, mimeType: f.mimeType, sizeBytes: f.sizeBytes,
});
const fileIn = (f: BillFile): Wire.BillFileRef => ({
  objectKey: f.storagePath, fileName: f.fileName, mimeType: f.mimeType as Wire.FileMimeType, sizeBytes: f.sizeBytes,
});

const toHouse = (h: Wire.House): House => ({
  id: h.id, name: h.name, address: h.address, currency: h.currency, splitMode: h.splitMode,
  fixedContributionCents: h.fixedContributionCents, contributionDayOfMonth: h.contributionDayOfMonth,
  showBalanceToRoommates: h.showBalanceToRoommates,
});
const toMember = (m: Wire.Member): HouseMember => ({
  id: m.userId, userId: m.userId, displayName: m.displayName ?? '', email: m.email ?? '', photoPath: m.photoKey,
  role: m.role, status: m.status, joinedAt: m.joinedAt, removedAt: m.removedAt,
  individualContributionCents: m.individualContributionCents,
});
const toCategory = (c: Wire.Category): ExpenseCategory => ({
  id: c.id, name: c.name, icon: normalizeIconName(c.icon as string), color: c.color as string, amountType: c.amountType,
  expectedAmountCents: c.expectedAmountCents, intervalUnit: c.intervalUnit as ExpenseCategory['intervalUnit'], intervalCount: c.intervalCount as number,
  anchorDate: c.anchorDate as string, isActive: c.isActive, sortOrder: c.sortOrder, notes: c.notes, names: c.names,
});
const toBill = (b: Wire.Bill): Bill => ({
  id: b.id, categoryId: b.categoryId, amountCents: b.amountCents, chargeDate: b.chargeDate,
  periodStartDate: b.periodStartDate, periodEndDate: b.periodEndDate,
  files: b.files.map(fileOut), notes: b.notes, ocrStatus: b.ocrStatus, ocrData: (b.ocrData ?? null) as Bill['ocrData'], createdAt: b.createdAt,
});
const toInvite = (i: Wire.Invite): HouseInvite => ({
  id: i.code, code: i.code, status: i.status, expiresAt: i.expiresAt, maxUses: i.maxUses, usedCount: i.usedCount,
});
const toPayment = (p: Wire.Payment): MemberPayment => ({
  id: p.id, memberId: p.memberId, month: p.month, amountCents: p.amountCents, paidAt: p.paidAt, note: p.note,
});
const toDocument = (d: Wire.UserDocument): UserDocument => ({
  id: d.id, type: d.type, storagePath: d.objectKey, fileName: d.fileName, mimeType: d.mimeType, sizeBytes: d.sizeBytes, uploadedAt: d.uploadedAt,
});

const notFoundAsNull = async <T>(p: Promise<T>): Promise<T | null> =>
  p.catch((e) => {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  });

export const httpApi: Api = {
  // User. Better Auth owns the email; `upsertUser` only syncs the editable profile fields.
  upsertUser: async (v) => {
    await sdk.updateMe({ body: { displayName: v.displayName, locale: v.locale, accountRole: v.accountRole } });
  },
  getMe: async (): Promise<User | null> => {
    const r = await notFoundAsNull(sdk.getMe());
    const u = r?.data;
    if (!u) return null;
    const role: HouseRole = u.accountRole === 'ADMIN' ? 'ADMIN' : 'ROOMMATE'; // new accounts start as 'USER'
    return { id: u.id, email: u.email, displayName: u.name, photoPath: u.photoKey, accountRole: role, locale: isLocale(u.locale) ? u.locale : DEFAULT_LOCALE };
  },
  updateMyProfile: async (v) => {
    await sdk.updateMe({ body: { displayName: v.displayName, photoKey: v.photoPath, locale: v.locale, accountRole: v.accountRole } });
  },
  listMyDocuments: async () => (await sdk.listMyDocuments()).data!.map(toDocument),
  addMyDocument: async (v) => {
    await sdk.addMyDocument({ body: { id: v.id, type: v.type, objectKey: v.storagePath, fileName: v.fileName, mimeType: v.mimeType as Wire.FileMimeType, sizeBytes: v.sizeBytes } });
  },
  deleteMyDocument: async (v) => {
    await sdk.deleteMyDocument({ path: { id: v.id } });
  },

  // Houses
  createHouse: async (v) => {
    await sdk.createHouse({ body: v });
  },
  updateHouse: async ({ houseId, ...body }) => {
    await sdk.updateHouse({ path: { houseId }, body });
  },
  listMyHouses: async () => (await sdk.listMyHouses()).data!.map((x) => ({ ...toHouse(x), role: x.role })),
  getHouse: async (v) => {
    const r = await notFoundAsNull(sdk.getHouse({ path: { houseId: v.houseId } }));
    return r && { house: toHouse(r.data!.house), members: r.data!.members.map(toMember) };
  },
  deleteHouse: async (v) => {
    await sdk.deleteHouse({ path: { houseId: v.houseId } }); // the Worker also deletes the house's files
  },

  // Members & invites
  createInvite: async ({ houseId, ...body }) => {
    await sdk.createInvite({ path: { houseId }, body });
  },
  revokeInvite: async (v) => {
    await sdk.revokeInvite({ path: { houseId: v.houseId, code: v.inviteId } });
  },
  listInvites: async (v) => {
    try {
      return (await sdk.listInvites({ path: { houseId: v.houseId } })).data!.map(toInvite);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) return []; // roommates
      throw e;
    }
  },
  redeemInvite: async (v) => {
    try {
      await sdk.redeemInvite({ body: v });
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
    await sdk.removeMember({ path: { houseId, memberId }, body: { removedAt } });
  },
  reactivateMember: async (v) => {
    await sdk.reactivateMember({ path: { houseId: v.houseId, memberId: v.memberId } });
  },
  createGuestMember: async ({ houseId, ...body }) => {
    await sdk.createGuestMember({ path: { houseId }, body });
  },
  setMemberContribution: async (v) => {
    await sdk.setMemberContribution({ path: { houseId: v.houseId, memberId: v.memberId }, body: { individualContributionCents: v.individualContributionCents } });
  },
  leaveHouse: async (v) => {
    await sdk.leaveHouse({ path: { houseId: v.houseId } });
  },
  listMembers: async (v) => (await sdk.listMembers({ path: { houseId: v.houseId } })).data!.map(toMember),

  // Categories. Delete rejects with message `CATEGORY_HAS_BILLS` (the server's error code).
  createCategory: async ({ houseId, ...body }) => {
    await sdk.createCategory({ path: { houseId }, body });
  },
  updateCategory: async ({ houseId, id, ...body }) => {
    await sdk.updateCategory({ path: { houseId, categoryId: id }, body });
  },
  archiveCategory: async (v) => {
    await sdk.updateCategory({ path: { houseId: v.houseId, categoryId: v.id }, body: { isActive: v.isActive } });
  },
  deleteCategory: async (v) => {
    await sdk.deleteCategory({ path: { houseId: v.houseId, categoryId: v.id } });
  },
  listCategories: async (v) => (await sdk.listCategories({ path: { houseId: v.houseId } })).data!.map(toCategory),
  setCategorySortOrder: async (v) => {
    await sdk.updateCategory({ path: { houseId: v.houseId, categoryId: v.id }, body: { sortOrder: v.sortOrder } });
  },

  // Bills (files are uploaded first with uploadFile(), then referenced here)
  createBill: async ({ houseId, files, ...rest }) => {
    await sdk.createBill({ path: { houseId }, body: { ...rest, files: files?.map(fileIn) } });
  },
  updateBill: async ({ houseId, id, files, ...rest }) => {
    await sdk.updateBill({ path: { houseId, billId: id }, body: { ...rest, files: files?.map(fileIn) } });
  },
  deleteBill: async (v) => {
    await sdk.deleteBill({ path: { houseId: v.houseId, billId: v.id } });
  },
  getBill: async (v) => {
    const r = await notFoundAsNull(sdk.getBill({ path: { houseId: v.houseId, billId: v.id } }));
    return r && toBill(r.data!);
  },
  listBills: async (v) =>
    (await sdk.listBills({ path: { houseId: v.houseId }, query: { from: v.from, to: v.to, categoryId: v.categoryId } })).data!.map(toBill),

  // Payments
  recordPayment: async ({ houseId, ...body }) => {
    await sdk.recordPayment({ path: { houseId }, body });
  },
  deletePayment: async (v) => {
    await sdk.deletePayment({ path: { houseId: v.houseId, paymentId: v.id } });
  },
  listPayments: async (v) => (await sdk.listPayments({ path: { houseId: v.houseId }, query: { from: v.from, to: v.to } })).data!.map(toPayment),
};
