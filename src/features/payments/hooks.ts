import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/db';
import { optimisticOptions } from '@/lib/optimistic';
import { qk } from '@/lib/queryKeys';
import { newId } from '@/lib/storage';
import type { MemberPayment } from '@/types/domain';

/** Payments whose `month` (first day of month, ISO) is within [from, to]. Members can read; only admins write. */
export function usePayments(houseId: string | null | undefined, range: { from: string; to: string }) {
  return useQuery({
    queryKey: qk.payments(houseId ?? '', range.from, range.to),
    queryFn: () => api.listPayments({ houseId: houseId as string, ...range }),
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
