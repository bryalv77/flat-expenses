import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Locale } from '@/types/domain';

export type ThemeMode = 'system' | 'light' | 'dark';

interface UiState {
  themeMode: ThemeMode;
  locale: Locale;
  activeHouseId: string | null;
  setThemeMode: (mode: ThemeMode) => void;
  setLocale: (locale: Locale) => void;
  setActiveHouseId: (id: string | null) => void;
}

/** Tiny persisted UI state. Everything else lives in TanStack Query. */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      themeMode: 'system',
      locale: 'es',
      activeHouseId: null,
      setThemeMode: (themeMode) => set({ themeMode }),
      setLocale: (locale) => set({ locale }),
      setActiveHouseId: (activeHouseId) => set({ activeHouseId }),
    }),
    {
      name: 'costos-piso-ui',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ themeMode: s.themeMode, locale: s.locale, activeHouseId: s.activeHouseId }),
    },
  ),
);
