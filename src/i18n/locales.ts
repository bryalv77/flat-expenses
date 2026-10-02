/**
 * Locale registry: the ONE place to add a language (plus one translation file, see README "Adding a language").
 * `Locale` is derived from it, so adding an entry here widens the type everywhere.
 */
export const LOCALES = [
  { code: 'es', label: 'Español', intlLocale: 'es-ES', dir: 'ltr' },
  { code: 'en', label: 'English', intlLocale: 'en-GB', dir: 'ltr' },
  { code: 'fr', label: 'Français', intlLocale: 'fr-FR', dir: 'ltr' },
  { code: 'de', label: 'Deutsch', intlLocale: 'de-DE', dir: 'ltr' },
  { code: 'pt', label: 'Português', intlLocale: 'pt-PT', dir: 'ltr' },
  { code: 'it', label: 'Italiano', intlLocale: 'it-IT', dir: 'ltr' },
  { code: 'ca', label: 'Català', intlLocale: 'ca-ES', dir: 'ltr' },
] as const;

export type Locale = (typeof LOCALES)[number]['code'];
export type LocaleInfo = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'es';
export const FALLBACK_CHAIN: readonly Locale[] = ['en', 'es'];
export const LOCALE_CODES: readonly Locale[] = LOCALES.map((l) => l.code);

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && LOCALE_CODES.includes(value as Locale);
}

export function localeInfo(locale: Locale): LocaleInfo {
  return LOCALES.find((l) => l.code === locale) ?? LOCALES[0];
}

/** BCP-47 tag used with `Intl.*` for a registry locale. */
export function intlLocaleOf(locale: Locale): string {
  return localeInfo(locale).intlLocale;
}

/** Maps a device language code (`"fr"`, `"pt-BR"`, `"es_MX"`) to a registry locale, or `fallback`. */
export function matchLocale(languageCode: string | null | undefined): Locale | null;
export function matchLocale(languageCode: string | null | undefined, fallback: Locale): Locale;
export function matchLocale(languageCode: string | null | undefined, fallback: Locale | null = null): Locale | null {
  const base = (languageCode ?? '').toLowerCase().split(/[-_]/)[0];
  return isLocale(base) ? base : fallback;
}
