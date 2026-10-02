import { ca } from './ca';
import { de } from './de';
import { en } from './en';
import { es, type Messages } from './es';
import { fr } from './fr';
import { it } from './it';
import { FALLBACK_CHAIN, intlLocaleOf, type Locale } from './locales';
import { pt } from './pt';

/** Pure (no React, no store) so schedule/report code and tests can translate too. */

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends string ? string : DeepPartial<T[K]> };

/** Dotted paths of every string leaf in `T`. */
type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type TranslationKey = Leaves<Messages>;

/** Base keys that have `_one` / `_other` (and optionally `_zero|_two|_few|_many`) variants. */
type StripOther<T> = T extends `${infer B}_other` ? B : never;
export type PluralKey = StripOther<TranslationKey>;

export type Vars = Record<string, string | number>;

export const dictionaries: Record<Locale, DeepPartial<Messages>> = { es, en, fr, de, pt, it, ca };

const warned = new Set<string>();
function warnMissing(locale: Locale, key: string): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  const id = `${locale}:${key}`;
  if (warned.has(id)) return;
  warned.add(id);
  console.warn(`[i18n] missing "${key}" for locale "${locale}"`);
}

function lookup(dict: DeepPartial<Messages>, key: string): string | undefined {
  const found = key.split('.').reduce<unknown>((acc, part) => (acc as Record<string, unknown> | undefined)?.[part], dict);
  return typeof found === 'string' ? found : undefined;
}

function interpolate(text: string, vars?: Vars): string {
  return vars ? text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(vars[name] ?? '')) : text;
}

/** locale -> English -> Spanish -> the key itself. */
function resolve(locale: Locale, key: string): string {
  const own = lookup(dictionaries[locale], key);
  if (own !== undefined) return own;
  warnMissing(locale, key);
  for (const fallback of FALLBACK_CHAIN) {
    const text = lookup(dictionaries[fallback], key);
    if (text !== undefined) return text;
  }
  return key;
}

export function translate(locale: Locale, key: TranslationKey, vars?: Vars): string {
  return interpolate(resolve(locale, key), vars);
}

const pluralRules = new Map<Locale, Intl.PluralRules>();

/** Plural category (`zero|one|two|few|many|other`) for `count` in the locale. */
export function pluralCategory(locale: Locale, count: number): Intl.LDMLPluralRule {
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(intlLocaleOf(locale));
    pluralRules.set(locale, rules);
  }
  return rules.select(count);
}

/**
 * Pluralised message: picks `${base}_${category}` (falls back to `_other`). `{{n}}` is always set to `count`.
 * e.g. translatePlural('es', 'schedule.week', 4) -> "Cada 4 semanas".
 */
export function translatePlural(locale: Locale, base: PluralKey, count: number, vars?: Vars): string {
  const category = pluralCategory(locale, count);
  const specific = lookup(dictionaries[locale], `${base}_${category}`);
  const text = specific ?? resolve(locale, `${base}_other`);
  return interpolate(text, { n: count, ...vars });
}
