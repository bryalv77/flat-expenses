import { dayOf } from '@/lib/dates';
import type { Bill } from '@/types/domain';

/** Minimum bill shape needed by the finance/report/schedule computations. */
export type BillCore = Pick<Bill, 'categoryId' | 'amountCents' | 'chargeDate' | 'periodEndDate' | 'createdAt'>;

/**
 * Reporting date rule: chargeDate, else periodEndDate, else the date part of createdAt.
 * Mirrors the denormalized `effectiveDate` stored on bill documents (see src/lib/db.ts).
 */
export function getEffectiveDate(bill: Pick<BillCore, 'chargeDate' | 'periodEndDate' | 'createdAt'>): string {
  return dayOf(bill.chargeDate ?? bill.periodEndDate ?? bill.createdAt);
}

export function getEffectiveMonth(bill: Pick<BillCore, 'chargeDate' | 'periodEndDate' | 'createdAt'>): string {
  return getEffectiveDate(bill).slice(0, 7);
}
