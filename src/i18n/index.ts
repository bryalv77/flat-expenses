import { useCallback } from 'react';

import { useUiStore } from '@/lib/uiStore';
import type { Locale } from '@/types/domain';

import { en } from './en';
import { es, type Messages } from './es';

const dictionaries: Record<Locale, Messages> = { es, en };

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type TranslationKey = Leaves<Messages>;

export function translate(locale: Locale, key: TranslationKey, vars?: Record<string, string | number>): string {
  const found = key.split('.').reduce<unknown>((acc, part) => (acc as Record<string, unknown> | undefined)?.[part], dictionaries[locale]);
  const text = typeof found === 'string' ? found : key;
  return vars ? text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(vars[name] ?? '')) : text;
}

export function useT() {
  const locale = useUiStore((s) => s.locale);
  const t = useCallback((key: TranslationKey, vars?: Record<string, string | number>) => translate(locale, key, vars), [locale]);
  return { t, locale };
}
