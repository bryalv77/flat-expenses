import type { CategoryInput } from '@/lib/db';

/** One-tap suggestions offered by the create-house wizard. `anchorDate` is filled in at seed time. */
export const SUGGESTED_CATEGORIES: Omit<CategoryInput, 'anchorDate' | 'sortOrder'>[] = [
  { name: 'Alquiler', icon: 'home', color: '#007AFF', amountType: 'FIXED', expectedAmountCents: 120000, intervalUnit: 'MONTH', intervalCount: 1 },
  { name: 'Luz', icon: 'flash', color: '#FF9500', amountType: 'VARIABLE', intervalUnit: 'MONTH', intervalCount: 1 },
  { name: 'Internet', icon: 'wifi', color: '#5856D6', amountType: 'FIXED', expectedAmountCents: 3990, intervalUnit: 'MONTH', intervalCount: 1 },
  { name: 'Teléfono', icon: 'call', color: '#34C759', amountType: 'VARIABLE', intervalUnit: 'MONTH', intervalCount: 1 },
  { name: 'Gas', icon: 'flame', color: '#FF3B30', amountType: 'VARIABLE', intervalUnit: 'MONTH', intervalCount: 2 },
  { name: 'Limpieza', icon: 'sparkles', color: '#5AC8FA', amountType: 'VARIABLE', intervalUnit: 'MONTH', intervalCount: 1 },
  { name: 'Agua', icon: 'water', color: '#32ADE6', amountType: 'VARIABLE', intervalUnit: 'MONTH', intervalCount: 3 },
  { name: 'Netflix', icon: 'tv', color: '#AF52DE', amountType: 'FIXED', expectedAmountCents: 1500, intervalUnit: 'WEEK', intervalCount: 4 },
];
