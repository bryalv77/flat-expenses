import type { CategoryInput } from '@/lib/db';
import type { TranslationKey } from '@/i18n';

type Suggested = Omit<CategoryInput, 'name' | 'anchorDate' | 'sortOrder'> & { nameKey: TranslationKey };

/** One-tap suggestions offered by the create-house wizard. The name is translated at seed time; `anchorDate` is filled in then too. */
export const SUGGESTED_CATEGORIES: Suggested[] = [
  { nameKey: 'suggestedCategories.rent', icon: 'home', color: '#007AFF', amountType: 'FIXED', expectedAmountCents: 120000, intervalUnit: 'MONTH', intervalCount: 1 },
  { nameKey: 'suggestedCategories.electricity', icon: 'bolt', color: '#FF9500', amountType: 'VARIABLE', intervalUnit: 'MONTH', intervalCount: 1 },
  { nameKey: 'suggestedCategories.internet', icon: 'wifi', color: '#5856D6', amountType: 'FIXED', expectedAmountCents: 3990, intervalUnit: 'MONTH', intervalCount: 1 },
  { nameKey: 'suggestedCategories.phone', icon: 'phone', color: '#34C759', amountType: 'VARIABLE', intervalUnit: 'MONTH', intervalCount: 1 },
  { nameKey: 'suggestedCategories.gas', icon: 'flame', color: '#FF3B30', amountType: 'VARIABLE', intervalUnit: 'MONTH', intervalCount: 2 },
  { nameKey: 'suggestedCategories.cleaning', icon: 'sparkles', color: '#5AC8FA', amountType: 'VARIABLE', intervalUnit: 'MONTH', intervalCount: 1 },
  { nameKey: 'suggestedCategories.water', icon: 'drop', color: '#32ADE6', amountType: 'VARIABLE', intervalUnit: 'MONTH', intervalCount: 3 },
  { nameKey: 'suggestedCategories.netflix', icon: 'tv', color: '#AF52DE', amountType: 'FIXED', expectedAmountCents: 1500, intervalUnit: 'WEEK', intervalCount: 4 },
];
