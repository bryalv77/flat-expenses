/** Shared domain types. Money is always integer cents. Dates are ISO strings (`YYYY-MM-DD`) unless noted. */

export type HouseRole = 'ADMIN' | 'ROOMMATE';
export type SplitMode = 'EQUAL' | 'FIXED_CONTRIBUTION';
export type AmountType = 'FIXED' | 'VARIABLE';
export type IntervalUnit = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
export type DocumentType = 'PASSPORT' | 'NATIONAL_ID';
export type InviteStatus = 'ACTIVE' | 'REVOKED' | 'EXPIRED';
export type MemberStatus = 'ACTIVE' | 'REMOVED';
export type OcrStatus = 'NONE' | 'PENDING' | 'DONE' | 'FAILED';
export type Locale = 'es' | 'en';

export interface User {
  id: string;
  email: string;
  displayName: string;
  photoPath: string | null;
  accountRole: HouseRole;
  locale: Locale;
}

export interface UserDocument {
  id: string;
  type: DocumentType;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface House {
  id: string;
  name: string;
  address: string | null;
  currency: string;
  splitMode: SplitMode;
  fixedContributionCents: number | null;
  contributionDayOfMonth: number | null;
  showBalanceToRoommates: boolean;
}

export interface HouseMember {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  photoPath: string | null;
  role: HouseRole;
  status: MemberStatus;
  joinedAt: string;
  removedAt: string | null;
  individualContributionCents: number | null;
}

export interface HouseInvite {
  id: string;
  code: string;
  status: InviteStatus;
  expiresAt: string;
  maxUses: number;
  usedCount: number;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  amountType: AmountType;
  expectedAmountCents: number | null;
  intervalUnit: IntervalUnit;
  intervalCount: number;
  anchorDate: string;
  isActive: boolean;
  sortOrder: number;
  notes: string | null;
}

export interface Bill {
  id: string;
  categoryId: string;
  amountCents: number;
  chargeDate: string | null;
  periodStartDate: string | null;
  periodEndDate: string | null;
  fileStoragePath: string | null;
  fileName: string | null;
  fileMimeType: string | null;
  fileSizeBytes: number | null;
  notes: string | null;
  ocrStatus: OcrStatus;
  ocrData: unknown;
  createdAt: string;
}

export interface MemberPayment {
  id: string;
  memberId: string;
  month: string;
  amountCents: number;
  paidAt: string;
  note: string | null;
}
