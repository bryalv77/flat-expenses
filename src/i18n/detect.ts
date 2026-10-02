import { getLocales } from 'expo-localization';

import { DEFAULT_LOCALE, matchLocale, type Locale } from './locales';

/**
 * Best registry match for the device's preferred languages (first supported one wins), else the default.
 * Never throws (static web export runs this in Node).
 */
export function detectDeviceLocale(): Locale {
  try {
    for (const l of getLocales()) {
      const match = matchLocale(l.languageCode);
      if (match) return match;
    }
  } catch {
    // no device locale available
  }
  return DEFAULT_LOCALE;
}
