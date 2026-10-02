import type { Bill, ExpenseCategory, HouseMember } from '@/types/domain';

export function makeCategory(
  overrides: Partial<ExpenseCategory> & { id: string },
): ExpenseCategory {
  return {
    name: overrides.id,
    icon: 'flame',
    color: '#007AFF',
    amountType: 'VARIABLE',
    expectedAmountCents: null,
    intervalUnit: 'MONTH',
    intervalCount: 1,
    anchorDate: '2025-01-01',
    isActive: true,
    sortOrder: 0,
    notes: null,
    ...overrides,
  };
}

let billSeq = 0;
export function makeBill(
  categoryId: string,
  amountCents: number,
  chargeDate: string | null,
  overrides: Partial<Bill> = {},
): Bill {
  billSeq += 1;
  return {
    id: `bill-${billSeq}`,
    categoryId,
    amountCents,
    chargeDate,
    periodStartDate: null,
    periodEndDate: null,
    fileStoragePath: null,
    fileName: null,
    fileMimeType: null,
    fileSizeBytes: null,
    notes: null,
    ocrStatus: 'NONE',
    ocrData: null,
    createdAt: '2025-01-01T10:00:00.000Z',
    ...overrides,
  };
}

export function makeMember(
  id: string,
  joinedAt: string,
  overrides: Partial<HouseMember> = {},
): HouseMember {
  return {
    id,
    userId: `u-${id}`,
    displayName: id,
    email: `${id}@example.com`,
    photoPath: null,
    role: 'ROOMMATE',
    status: 'ACTIVE',
    joinedAt,
    removedAt: null,
    individualContributionCents: null,
    ...overrides,
  };
}

export const RENT = makeCategory({
  id: 'rent',
  name: 'Alquiler',
  amountType: 'FIXED',
  expectedAmountCents: 120000,
  anchorDate: '2025-01-01',
});

export const NETFLIX = makeCategory({
  id: 'netflix',
  name: 'Netflix',
  amountType: 'FIXED',
  expectedAmountCents: 1500,
  intervalUnit: 'WEEK',
  intervalCount: 4,
  anchorDate: '2025-01-03',
});

export const GAS = makeCategory({
  id: 'gas',
  name: 'Gas',
  amountType: 'VARIABLE',
  intervalUnit: 'MONTH',
  intervalCount: 2,
  anchorDate: '2025-01-15',
});

export const ELECTRICITY = makeCategory({
  id: 'electricity',
  name: 'Luz',
  amountType: 'VARIABLE',
  anchorDate: '2024-01-01',
});
