/**
 * Per-alert-type map settings, like WeatherWise's alert settings: whether each NWS alert type
 * shows, and its colour, outline thickness and fill opacity. Defaults are WeatherWise's
 * (data/alertStyles.ts); only the changes are stored, on this device.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { ALERT_STYLES, alertLineWidth, alertShownByDefault } from '@/data/alertStyles';

const STORAGE_KEY = 'sentinel:alertSettings:v1';
export const DEFAULT_FILL_OPACITY = 0.4;

export interface AlertTypeSettings {
  enabled: boolean;
  color: string;
  lineWidth: number;
  fillOpacity: number;
}

type Overrides = Record<string, Partial<AlertTypeSettings>>;

export function defaultAlertSettings(code: string): AlertTypeSettings {
  return {
    enabled: alertShownByDefault(code),
    color: ALERT_STYLES[code]?.color ?? '#C0C0C0',
    lineWidth: alertLineWidth(code),
    fillOpacity: DEFAULT_FILL_OPACITY,
  };
}

interface AlertSettingsValue {
  settingsFor: (code: string) => AlertTypeSettings;
  isCustomized: (code: string) => boolean;
  update: (code: string, change: Partial<AlertTypeSettings>) => void;
  reset: (code: string) => void;
  resetAll: () => void;
  /** Changes so far, for memo dependencies. */
  overrides: Overrides;
}

const AlertSettingsContext = createContext<AlertSettingsValue | null>(null);

export function AlertSettingsProvider({ children }: { children: React.ReactNode }) {
  const [overrides, setOverrides] = useState<Overrides>({});

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => raw && setOverrides(JSON.parse(raw)))
      .catch(() => {});
  }, []);

  const save = useCallback((next: Overrides) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
    return next;
  }, []);

  const settingsFor = useCallback((code: string) => ({ ...defaultAlertSettings(code), ...overrides[code] }), [overrides]);

  const update = useCallback(
    (code: string, change: Partial<AlertTypeSettings>) =>
      setOverrides(prev => {
        const defaults = defaultAlertSettings(code);
        const merged: Partial<AlertTypeSettings> = { ...prev[code], ...change };
        // Keep only what differs from the default.
        for (const k of Object.keys(merged) as (keyof AlertTypeSettings)[]) if (merged[k] === defaults[k]) delete merged[k];
        const next = { ...prev };
        if (Object.keys(merged).length) next[code] = merged;
        else delete next[code];
        return save(next);
      }),
    [save],
  );

  const reset = useCallback(
    (code: string) =>
      setOverrides(prev => {
        const next = { ...prev };
        delete next[code];
        return save(next);
      }),
    [save],
  );

  const resetAll = useCallback(() => setOverrides(save({})), [save]);

  const value = useMemo(
    () => ({ settingsFor, isCustomized: (code: string) => Boolean(overrides[code]), update, reset, resetAll, overrides }),
    [settingsFor, overrides, update, reset, resetAll],
  );
  return <AlertSettingsContext.Provider value={value}>{children}</AlertSettingsContext.Provider>;
}

export function useAlertSettings(): AlertSettingsValue {
  const ctx = useContext(AlertSettingsContext);
  if (!ctx) throw new Error('useAlertSettings must be used inside <AlertSettingsProvider>');
  return ctx;
}
