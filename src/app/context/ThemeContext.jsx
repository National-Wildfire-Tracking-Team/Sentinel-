/**
 * ThemeContext.jsx
 * App-wide light/dark theme. Persisted to localStorage and a parent-domain
 * cookie (so the marketing site follows it too — see shared/utils/sharedTheme);
 * applied by toggling the `dark` class on <html> (Tailwind's `darkMode: 'class'`
 * reads this).
 */

import { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { readSharedTheme, writeSharedTheme, applyThemeClass } from '../../shared/utils/sharedTheme';

function getInitialTheme() {
  if (typeof window === 'undefined') return 'dark';
  return readSharedTheme() ?? 'dark';
}

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(getInitialTheme);

  useEffect(() => {
    applyThemeClass(theme);
    writeSharedTheme(theme);
  }, [theme]);

  const setTheme = useCallback((next) => {
    setThemeState(next === 'light' ? 'light' : 'dark');
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

/** Hook to consume theme context */
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>');
  return ctx;
}
