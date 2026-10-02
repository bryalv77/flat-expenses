import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { detectDeviceLocale } from '@/i18n/detect';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n/locales';

export type ThemeMode = 'system' | 'light' | 'dark';

interface UiState {
  themeMode: ThemeMode;
  locale: Locale;
  /** True once the user (or their saved profile) picked a language; until then the device language is used. */
  localeChosen: boolean;
  activeHouseId: string | null;
  setThemeMode: (mode: ThemeMode) => void;
  /** An explicit choice: always wins over device detection from now on. */
  setLocale: (locale: Locale) => void;
  setActiveHouseId: (id: string | null) => void;
}

/**
 * Tiny persisted UI state. Everything else lives in TanStack Query.
 *
 * The initial locale is the deterministic default so the static web export and the first client render match
 * (no hydration mismatch); device-language detection runs right after rehydration, on first run only.
 */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      themeMode: 'system',
      locale: DEFAULT_LOCALE,
      localeChosen: false,
      activeHouseId: null,
      setThemeMode: (themeMode) => set({ themeMode }),
      setLocale: (locale) => set({ locale, localeChosen: true }),
      setActiveHouseId: (activeHouseId) => set({ activeHouseId }),
    }),
    {
      name: 'costos-piso-ui',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        themeMode: s.themeMode,
        locale: s.locale,
        localeChosen: s.localeChosen,
        activeHouseId: s.activeHouseId,
      }),
      // v0 stored only `locale` (default 'es'): treat a non-default stored value as a deliberate choice.
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<UiState>;
        if (version < 1) state.localeChosen = isLocale(state.locale) && state.locale !== DEFAULT_LOCALE;
        return state as UiState;
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (!isLocale(state.locale)) useUiStore.setState({ locale: DEFAULT_LOCALE, localeChosen: false });
        if (!useUiStore.getState().localeChosen) useUiStore.setState({ locale: detectDeviceLocale() });
      },
    },
  ),
);
