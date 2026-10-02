import { useCallback } from 'react';

import { useUiStore } from '@/lib/uiStore';

import type { Locale } from './locales';
import { translate, translatePlural, type PluralKey, type TranslationKey, type Vars } from './translate';

export * from './locales';
export { translate, translatePlural, pluralCategory } from './translate';
export type { DeepPartial, PluralKey, TranslationKey, Vars } from './translate';

export function useT() {
  const locale: Locale = useUiStore((s) => s.locale);
  const t = useCallback((key: TranslationKey, vars?: Vars) => translate(locale, key, vars), [locale]);
  const tp = useCallback((key: PluralKey, count: number, vars?: Vars) => translatePlural(locale, key, count, vars), [locale]);
  return { t, tp, locale };
}
