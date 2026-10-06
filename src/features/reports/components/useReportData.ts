import { useMemo } from 'react';

import { useBills } from '@/features/bills/hooks';
import { useCategories } from '@/features/categories/hooks';
import { useActiveHouse } from '@/features/houses/hooks';
import { useMembers } from '@/features/members/hooks';
import { usePayments } from '@/features/payments/hooks';
import { addMonthsToKey, monthEnd, monthKey, monthStart, todayISO } from '@/lib/dates';

/** History window loaded for reports: 6 years back so all-time totals, seasonality and year-over-year have data. */
export const REPORT_HISTORY_MONTHS = 72;

export function useReportData() {
  const { house, isAdmin, isLoading: houseLoading } = useActiveHouse();
  const houseId = house?.id;
  const currentMonth = monthKey(todayISO());
  const from = monthStart(addMonthsToKey(currentMonth, -(REPORT_HISTORY_MONTHS - 1)));
  const to = monthEnd(currentMonth);

  const bills = useBills(houseId, { from, to });
  const categories = useCategories(houseId);
  const members = useMembers(houseId ?? '');
  const payments = usePayments(houseId, { from, to });

  const activeCategories = useMemo(() => (categories.data ?? []).filter((c) => c.isActive), [categories.data]);

  return {
    house,
    isAdmin,
    currentMonth,
    bills: bills.data ?? [],
    categories: categories.data ?? [],
    activeCategories,
    members: members.data ?? [],
    payments: payments.data ?? [],
    isLoading: houseLoading || bills.isLoading || categories.isLoading,
    isError: bills.isError,
    isRefetching: bills.isRefetching,
    refetch: () => {
      void bills.refetch();
      void payments.refetch();
    },
  };
}

export type ReportData = ReturnType<typeof useReportData>;
