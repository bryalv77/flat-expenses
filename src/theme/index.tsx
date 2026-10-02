import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { useUiStore } from '@/lib/uiStore';

import { palettes, type ColorScheme, type Palette } from './tokens';

export * from './tokens';

export type ThemeMode = 'system' | 'light' | 'dark';

interface ThemeValue {
  scheme: ColorScheme;
  colors: Palette;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const mode = useUiStore((s) => s.themeMode);
  const setMode = useUiStore((s) => s.setThemeMode);

  const value = useMemo<ThemeValue>(() => {
    const scheme: ColorScheme = mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;
    return { scheme, colors: palettes[scheme], mode, setMode };
  }, [mode, system, setMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
