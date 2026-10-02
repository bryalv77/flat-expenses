import type { QueryClient } from '@tanstack/react-query';

import { SUGGESTED_CATEGORIES } from '@/features/categories/suggested';
import { api } from '@/lib/db';
import { qk } from '@/lib/queryKeys';
import { newId } from '@/lib/storage';

/** Creates the suggested categories for a freshly created house (used by the onboarding wizard). */
export async function seedSuggestedCategories(qc: QueryClient, houseId: string): Promise<void> {
  const anchorDate = new Date().toISOString().slice(0, 10);
  await Promise.all(
    SUGGESTED_CATEGORIES.map((c, sortOrder) => api.createCategory({ ...c, anchorDate, sortOrder, houseId, id: newId() }).catch(() => undefined)),
  );
  await qc.invalidateQueries({ queryKey: qk.categories(houseId) });
}
