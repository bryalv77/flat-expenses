import type { QueryClient } from '@tanstack/react-query';

import type { TranslationKey } from '@/i18n';
import { SUGGESTED_CATEGORIES } from '@/features/categories/suggested';
import { api } from '@/lib/db';
import { qk } from '@/lib/queryKeys';
import { newId } from '@/lib/storage';

/** Creates the suggested categories for a freshly created house, named in the UI language (used by the onboarding wizard). */
export async function seedSuggestedCategories(qc: QueryClient, houseId: string, t: (key: TranslationKey) => string): Promise<void> {
  const anchorDate = new Date().toISOString().slice(0, 10);
  await Promise.all(
    SUGGESTED_CATEGORIES.map(({ nameKey, ...c }, sortOrder) =>
      api.createCategory({ ...c, name: t(nameKey), anchorDate, sortOrder, houseId, id: newId() }).catch(() => undefined),
    ),
  );
  await qc.invalidateQueries({ queryKey: qk.categories(houseId) });
}
