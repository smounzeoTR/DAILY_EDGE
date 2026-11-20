import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { storage } from '@/lib/storage';

import { darkColors, lightColors, type ColorPalette } from './colors';

const THEME_KEY = 'pref.theme';

function savedPreference(): ThemePreference {
  try {
    const value = storage.getItemSync(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : 'auto';
  } catch {
    return 'auto';
  }
}

export type ThemePreference = 'auto' | 'light' | 'dark';
export type ColorScheme = 'light' | 'dark';

type ThemeContextValue = {
  scheme: ColorScheme;
  colors: ColorPalette;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  // Saved on the device (settings)
  const [preference, setPreferenceState] = useState<ThemePreference>(savedPreference);
  const setPreference = (value: ThemePreference) => {
    storage.setItemSync(THEME_KEY, value);
    setPreferenceState(value);
  };

  const value = useMemo<ThemeContextValue>(() => {
    const scheme: ColorScheme =
      preference === 'auto' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;
    return {
      scheme,
      colors: scheme === 'dark' ? darkColors : lightColors,
      preference,
      setPreference,
    };
  }, [preference, systemScheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
