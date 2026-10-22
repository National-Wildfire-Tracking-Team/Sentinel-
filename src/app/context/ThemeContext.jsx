/**
 * ThemeContext.jsx
 * App-wide light/dark theme. Follows the device's setting (`preference`
 * 'auto') unless Light or Dark is picked in the menu; only that pick is
 * persisted, to localStorage and a parent-domain cookie (so the marketing
 * site follows it too — see shared/utils/sharedTheme). Applied by toggling
 * the `dark` class on <html> (Tailwind's `darkMode: 'class'` reads this).
 */

import { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react';
import {
  readSharedTheme, writeSharedTheme, applyThemeClass, deviceTheme, watchDeviceTheme,
} from '../../shared/utils/sharedTheme';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  // 'auto' | 'light' | 'dark'
  const [preference, setPreferenceState] = useState(() => readSharedTheme() ?? 'auto');
  const [device, setDevice] = useState(deviceTheme);

  useEffect(() => watchDeviceTheme(setDevice), []);

  const theme = preference === 'auto' ? device : preference;

  useEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

  const setPreference = useCallback((next) => {
    const value = next === 'light' || next === 'dark' ? next : 'auto';
    setPreferenceState(value);
    writeSharedTheme(value);
  }, []);

  const setTheme = useCallback((next) => setPreference(next === 'light' ? 'light' : 'dark'), [setPreference]);

  const toggleTheme = useCallback(() => setPreference(theme === 'dark' ? 'light' : 'dark'), [setPreference, theme]);

  const value = useMemo(
    () => ({ theme, preference, setPreference, setTheme, toggleTheme }),
    [theme, preference, setPreference, setTheme, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

/** The theme context, or null outside <ThemeProvider> (isolated component tests). */
export function useOptionalTheme() {
  return useContext(ThemeContext);
}

/** Hook to consume theme context */
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>');
  return ctx;
}
