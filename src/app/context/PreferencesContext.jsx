/**
 * PreferencesContext.jsx
 * App-wide access to the current user's display preferences so the map
 * popup and the preferences panel share one Supabase-backed copy instead
 * of each fetching independently. Also applies the time-format preference
 * to formatDateTime globally, the same way ThemeContext applies dark mode
 * by toggling a class rather than threading a prop through every consumer.
 */

import { createContext, useContext, useEffect } from 'react';
import { useDisplayPreferences } from '../hooks/useDisplayPreferences';
import { setTimeFormatPreference } from '../utils/formatUtils';

const PreferencesContext = createContext(null);

export function PreferencesProvider({ children }) {
  const value = useDisplayPreferences();

  useEffect(() => {
    setTimeFormatPreference(value.prefs.timeFormat);
  }, [value.prefs.timeFormat]);

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

/** Hook to consume display preferences */
export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within <PreferencesProvider>');
  return ctx;
}
