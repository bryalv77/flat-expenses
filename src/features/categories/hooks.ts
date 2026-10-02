import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, type CategoryInput } from '@/lib/db';
import { optimisticOptions } from '@/lib/optimistic';
import { qk } from '@/lib/queryKeys';
import { newId } from '@/lib/storage';
import type { ExpenseCategory } from '@/types/domain';

import { SUGGESTED_CATEGORIES } from './suggested';

export function useCategories(houseId: string | null | undefined) {
  return useQuery({
    queryKey: qk.categories(houseId ?? ''),
    queryFn: () => api.listCategories({ houseId: houseId as string }),
    enabled: Boolean(houseId),
  });
}

export function useCreateCategory(houseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CategoryInput) => {
      const id = newId();
      await api.createCategory({ ...input, houseId, id });
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.categories(houseId) }),
  });
}

export function useUpdateCategory(houseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<CategoryInput> & { id: string }) => api.updateCategory({ ...input, houseId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.categories(houseId) }),
  });
}

/** Archive (isActive=false) or restore. Optimistic. */
export function useArchiveCategory(houseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; isActive: boolean }) => api.archiveCategory({ houseId, ...v }),
    ...optimisticOptions<{ id: string; isActive: boolean }, ExpenseCategory[]>(qc, qk.categories(houseId), (old, v) =>
      old.map((c) => (c.id === v.id ? { ...c, isActive: v.isActive } : c)),
    ),
  });
}

/** Persists a new order. Pass the category ids in their new order. Optimistic. */
export function useReorderCategories(houseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      await Promise.all(orderedIds.map((id, sortOrder) => api.setCategorySortOrder({ houseId, id, sortOrder })));
    },
    ...optimisticOptions<string[], ExpenseCategory[]>(qc, qk.categories(houseId), (old, ids) => {
      const rank = new Map(ids.map((id, i) => [id, i]));
      return old
        .map((c) => ({ ...c, sortOrder: rank.get(c.id) ?? c.sortOrder }))
        .sort((a, b) => a.sortOrder - b.sortOrder);
    }),
  });
}

/** Seeds the suggested categories (Alquiler, Luz, Internet, …). Existing names are skipped server-side by the unique key. */
export function useSeedSuggestedCategories(houseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const anchorDate = new Date().toISOString().slice(0, 10);
      await Promise.all(
        SUGGESTED_CATEGORIES.map((c, sortOrder) =>
          api.createCategory({ ...c, anchorDate, sortOrder, houseId, id: newId() }).catch(() => undefined),
        ),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.categories(houseId) }),
  });
}
