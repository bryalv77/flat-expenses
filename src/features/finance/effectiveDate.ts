import type { Bill } from '@/types/domain';

/**
 * Reporting date rule: chargeDate, else periodEndDate, else the date part of createdAt.
 * Mirrors the denormalized `effectiveDate` stored on bill documents (see src/lib/db.ts).
 */
export function getEffectiveDate(
  bill: Pick<Bill, 'chargeDate' | 'periodEndDate' | 'createdAt'>,
): string {
  return (bill.chargeDate ?? bill.periodEndDate ?? bill.createdAt).slice(0, 10);
}

export function getEffectiveMonth(
  bill: Pick<Bill, 'chargeDate' | 'periodEndDate' | 'createdAt'>,
): string {
  return getEffectiveDate(bill).slice(0, 7);
}
