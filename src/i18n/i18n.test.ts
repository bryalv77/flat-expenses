/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { centsToInputString, formatMonth, parseMoneyToCents } from '@/lib/format';

import { LOCALES, LOCALE_CODES, isLocale, matchLocale, type Locale } from './locales';
import { dictionaries, fallbackPluralCategory, pluralCategory, translate, translatePlural, type TranslationKey } from './translate';

type Tree = { [k: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[path] = v;
    else Object.assign(out, flatten(v, path));
  }
  return out;
}

const placeholders = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort().join(',');
const source = flatten(dictionaries.es as Tree);

describe('locale registry', () => {
  it('has unique codes and valid Intl locales', () => {
    expect(new Set(LOCALE_CODES).size).toBe(LOCALES.length);
    for (const l of LOCALES) expect(Intl.DateTimeFormat.supportedLocalesOf(l.intlLocale)).toHaveLength(1);
  });

  it('has a dictionary for every registered locale', () => {
    for (const code of LOCALE_CODES) expect(dictionaries[code]).toBeDefined();
  });

  it('matches device language codes', () => {
    expect(matchLocale('fr')).toBe('fr');
    expect(matchLocale('pt-BR')).toBe('pt');
    expect(matchLocale('es_MX')).toBe('es');
    expect(matchLocale('zh')).toBeNull();
    expect(matchLocale(null, 'es')).toBe('es');
    expect(isLocale('de')).toBe(true);
    expect(isLocale('xx')).toBe(false);
  });

  it('keeps the Firestore rules locale allow-list in sync with the registry', () => {
    const rules = readFileSync(join(__dirname, '../../firestore.rules'), 'utf8');
    const line = rules.split('\n').find((l) => l.includes('d.locale in'));
    const codes = [...(line?.match(/'([a-z]{2})'/g) ?? [])].map((c) => c.replace(/'/g, ''));
    expect([...codes].sort()).toEqual([...LOCALE_CODES].sort());
  });
});

describe.each(LOCALE_CODES.filter((c) => c !== 'es'))('translations: %s', (code) => {
  const flat = flatten(dictionaries[code] as Tree);

  it('has every key of the Spanish source', () => {
    const missing = Object.keys(source).filter((k) => !(k in flat));
    expect(missing).toEqual([]);
  });

  it('has no keys the source does not have', () => {
    expect(Object.keys(flat).filter((k) => !(k in source))).toEqual([]);
  });

  it('keeps the {{placeholders}} of each message', () => {
    const wrong = Object.keys(flat).filter((k) => k in source && placeholders(flat[k]) !== placeholders(source[k]));
    expect(wrong).toEqual([]);
  });

  it('has no empty strings', () => {
    expect(Object.keys(flat).filter((k) => flat[k].trim() === '')).toEqual([]);
  });
});

describe('plural keys', () => {
  it('always ship an _other form next to _one', () => {
    for (const code of LOCALE_CODES) {
      const flat = flatten(dictionaries[code] as Tree);
      for (const k of Object.keys(flat).filter((x) => x.endsWith('_one'))) {
        expect(flat[k.replace(/_one$/, '_other')]).toBeDefined();
      }
    }
  });
});

describe('translate', () => {
  it('interpolates variables', () => {
    expect(translate('es', 'reports.basedOn', { n: 14 })).toBe('Basado en 14 meses de datos');
    expect(translate('de', 'reports.basedOn', { n: 14 })).toBe('Basierend auf 14 Monaten Daten');
  });

  it('falls back to English, then Spanish, then the key', () => {
    const partial = dictionaries.ca;
    const saved = partial.common?.cancel;
    try {
      delete (partial.common as Record<string, string | undefined>).cancel;
      expect(translate('ca', 'common.cancel')).toBe('Cancel'); // English
    } finally {
      (partial.common as Record<string, string | undefined>).cancel = saved;
    }
    expect(translate('es', 'not.a.key' as TranslationKey)).toBe('not.a.key');
  });

  it('pluralises through Intl.PluralRules', () => {
    expect(translatePlural('es', 'schedule.week', 1)).toBe('Cada semana');
    expect(translatePlural('es', 'schedule.week', 4)).toBe('Cada 4 semanas');
    expect(translatePlural('en', 'schedule.month', 2)).toBe('Every 2 months');
    expect(translatePlural('fr', 'schedule.day', 1)).toBe('Chaque jour');
    expect(translatePlural('de', 'schedule.year', 3)).toBe('Alle 3 Jahre');
  });
});

describe('locale-aware formatting', () => {
  const sample: Locale[] = ['es', 'en', 'fr', 'de', 'pt', 'it', 'ca'];

  it('round-trips money through the input string in every locale', () => {
    for (const code of sample) {
      expect(parseMoneyToCents(centsToInputString(123450, code), code)).toBe(123450);
    }
  });

  it('formats long month names with the locale pattern', () => {
    expect(formatMonth('2026-03', 'es')).toBe('marzo de 2026');
    expect(formatMonth('2026-03', 'de')).toBe('März 2026');
    expect(formatMonth('2026-03', 'en')).toBe('March 2026');
  });
});

describe('plural rules without Intl.PluralRules (Hermes on iOS)', () => {
  it('fallback agrees with Intl for every locale and common counts', () => {
    for (const locale of LOCALE_CODES) {
      for (const n of [0, 1, 2, 3, 4, 12, 21, 100]) {
        expect([locale, n, fallbackPluralCategory(locale, n)]).toEqual([locale, n, pluralCategory(locale, n)]);
      }
    }
  });

  it('translatePlural keeps working when Intl.PluralRules is missing', () => {
    const original = Intl.PluralRules;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Intl as any).PluralRules = undefined;
    try {
      expect(translatePlural('es', 'schedule.month', 2)).toBe('Cada 2 meses');
      expect(translatePlural('es', 'schedule.month', 1)).not.toContain('meses');
    } finally {
      (Intl as unknown as { PluralRules: unknown }).PluralRules = original;
    }
  });
});
