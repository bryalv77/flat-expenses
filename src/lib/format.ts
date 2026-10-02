import { DEFAULT_LOCALE, intlLocaleOf, type Locale } from '@/i18n/locales';
import { parseISODate, toISODate } from './dates';

const separatorCache = new Map<Locale, { decimal: string; group: string }>();

/** Decimal and grouping separators for the locale, taken from Intl (so any registry locale works). */
function separators(locale: Locale): { decimal: string; group: string } {
  let sep = separatorCache.get(locale);
  if (!sep) {
    const parts = new Intl.NumberFormat(intlLocaleOf(locale), { useGrouping: 'always' } as Intl.NumberFormatOptions).formatToParts(
      11111.1,
    );
    sep = {
      decimal: parts.find((p) => p.type === 'decimal')?.value ?? '.',
      group: parts.find((p) => p.type === 'group')?.value ?? ',',
    };
    separatorCache.set(locale, sep);
  }
  return sep;
}

const moneyCache = new Map<string, Intl.NumberFormat>();

function moneyFormatter(
  locale: Locale,
  currency: string,
  withDecimals: boolean,
): Intl.NumberFormat {
  const key = `${locale}|${currency}|${withDecimals}`;
  let f = moneyCache.get(key);
  if (!f) {
    const options = {
      style: 'currency',
      currency,
      // 'always' keeps `1.200,00 €` in es (es-ES skips grouping for 4-digit numbers by default).
      useGrouping: 'always',
      minimumFractionDigits: withDecimals ? 2 : 0,
      maximumFractionDigits: withDecimals ? 2 : 0,
    } as Intl.NumberFormatOptions;
    f = new Intl.NumberFormat(intlLocaleOf(locale), options);
    moneyCache.set(key, f);
  }
  return f;
}

/** Formats integer cents, e.g. 120000 -> `1.200,00 €` (es). */
export function formatMoney(
  cents: number,
  locale: Locale = DEFAULT_LOCALE,
  options: { currency?: string; compact?: boolean } = {},
): string {
  const { currency = 'EUR', compact = false } = options;
  const value = Math.round(cents) / 100;
  return moneyFormatter(locale, currency, !compact).format(value);
}

/** Formats a signed delta, always with +/- sign (zero without sign). */
export function formatSignedMoney(cents: number, locale: Locale = DEFAULT_LOCALE, currency = 'EUR'): string {
  const base = formatMoney(Math.abs(cents), locale, { currency });
  if (cents > 0) return `+${base}`;
  if (cents < 0) return `-${base}`;
  return base;
}

/**
 * Parses user-typed money into integer cents. Returns null for empty/invalid input.
 * Accepts `1.200,50`, `1200,5`, `1,200.50`, `12`, `12.5`, `€ 15`.
 */
export function parseMoneyToCents(input: string, locale: Locale = DEFAULT_LOCALE): number | null {
  let s = input.replace(/[^\d.,-]/g, '').trim();
  if (!s || s === '-' || s === ',' || s === '.') return null;
  const negative = s.startsWith('-');
  s = s.replace(/-/g, '');
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  // Grouping can be a (narrow) no-break space (fr, pt...) which the strip above already removed, so only '.' and ',' matter.
  const localeDecimal = separators(locale).decimal;
  const localeThousands = separators(locale).group;

  let decimalSep: string | null = null;
  if (lastDot >= 0 && lastComma >= 0) {
    decimalSep = lastDot > lastComma ? '.' : ',';
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? '.' : ',';
    const count = s.split(sep).length - 1;
    const digitsAfter = s.length - s.lastIndexOf(sep) - 1;
    if (count > 1)
      decimalSep = null; // repeated => thousands separator
    else if (sep === localeDecimal) decimalSep = sep;
    else if (sep === localeThousands && digitsAfter === 3) decimalSep = null;
    else decimalSep = sep;
  }

  let intPart = s;
  let fracPart = '';
  if (decimalSep) {
    const idx = s.lastIndexOf(decimalSep);
    intPart = s.slice(0, idx);
    fracPart = s.slice(idx + 1);
  }
  intPart = intPart.replace(/[.,]/g, '');
  fracPart = fracPart.replace(/[.,]/g, '');
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracPart)) return null;
  if (!intPart && !fracPart) return null;
  const cents = Number(intPart || '0') * 100 + Number((fracPart + '00').slice(0, 2));
  if (!Number.isFinite(cents)) return null;
  return negative ? -cents : cents;
}

/** Plain decimal string for editing in an input, e.g. 120050 -> `1200,50` (es). */
export function centsToInputString(cents: number, locale: Locale = DEFAULT_LOCALE): string {
  const abs = Math.abs(Math.round(cents));
  const int = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  const sep = separators(locale).decimal;
  return `${cents < 0 ? '-' : ''}${int}${sep}${frac}`;
}

function dateFromISO(iso: string): Date {
  const { y, m, d } = parseISODate(iso);
  return new Date(y, m - 1, d, 12); // noon avoids DST edge cases
}

export function formatDate(
  iso: string,
  locale: Locale = DEFAULT_LOCALE,
  style: 'short' | 'medium' | 'long' = 'medium',
): string {
  const opts: Record<string, Intl.DateTimeFormatOptions> = {
    short: { day: '2-digit', month: '2-digit', year: 'numeric' },
    medium: { day: 'numeric', month: 'short', year: 'numeric' },
    long: { day: 'numeric', month: 'long', year: 'numeric' },
  };
  return new Intl.DateTimeFormat(intlLocaleOf(locale), opts[style]).format(dateFromISO(iso));
}

/** `2026-03` -> `marzo de 2026` (long) / `mar 2026` (short). */
export function formatMonth(
  key: string,
  locale: Locale = DEFAULT_LOCALE,
  style: 'long' | 'short' = 'long',
): string {
  const date = dateFromISO(`${key.slice(0, 7)}-01`);
  if (style === 'long') {
    // Intl handles the per-language pattern ("marzo de 2026", "März 2026", "mars 2026", "març del 2026"...).
    return new Intl.DateTimeFormat(intlLocaleOf(locale), { month: 'long', year: 'numeric' }).format(date);
  }
  const month = new Intl.DateTimeFormat(intlLocaleOf(locale), { month: 'short' }).format(date);
  return `${month.replace('.', '')} ${date.getFullYear()}`;
}

export function formatMonthName(
  monthOfYear: number,
  locale: Locale = DEFAULT_LOCALE,
  style: 'long' | 'short' = 'short',
): string {
  const name = new Intl.DateTimeFormat(intlLocaleOf(locale), {
    month: style,
  }).format(new Date(2021, monthOfYear - 1, 1, 12));
  return name.replace('.', '');
}

/** `0.1234` -> `12,3 %` (es) */
export function formatPercent(ratio: number, locale: Locale = DEFAULT_LOCALE, fractionDigits = 1): string {
  return new Intl.NumberFormat(intlLocaleOf(locale), {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(ratio);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export { toISODate };
