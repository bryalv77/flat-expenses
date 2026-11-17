import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { monthKey, monthStart } from '@/lib/dates';
import { api } from '@/lib/db';
import { optimisticOptions } from '@/lib/optimistic';
import { qk } from '@/lib/queryKeys';
import { newId } from '@/lib/storage';
import type { MemberPayment } from '@/types/domain';

/** Payments whose `month` (first day of month, ISO) is within [from, to]. Members can read; only admins write. */
export function usePayments(houseId: string | null | undefined, range: { from: string; to: string }) {
  // `month` is always a first-of-month date and the backends (Worker, local) reject any other value, so callers may pass a month end.
  const q = { from: monthStart(monthKey(range.from)), to: monthStart(monthKey(range.to)) };
  return useQuery({
    queryKey: qk.payments(houseId ?? '', q.from, q.to),
    queryFn: () => api.listPayments({ houseId: houseId as string, ...q }),
    enabled: Boolean(houseId),
  });
}

export function useRecordPayment(houseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { memberId: string; month: string; amountCents: number; note?: string | null }) => {
      const id = newId();
      await api.recordPayment({ ...v, houseId, id });
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.paymentsOf(houseId) }),
  });
}

export function useDeletePayment(houseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deletePayment({ houseId, id }),
    ...optimisticOptions<string, MemberPayment[]>(qc, qk.paymentsOf(houseId), (old, id) => old.filter((p) => p.id !== id)),
  });
}
