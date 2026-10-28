/** Live weather data for the map, each fetched only while its layer (or the alerts feed) is on. */
import { useEffect, useState } from 'react';

import { fetchLightning } from '@/data/lightning';
import { fetchLatestMrms, type MrmsFrame } from '@/data/mrms';
import { fetchAlerts, type WeatherAlert } from '@/data/weatherAlerts';

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/** Poll `load` every `intervalMs` while enabled; keeps the last good value on errors. */
function usePolled<T>(enabled: boolean, intervalMs: number, load: () => Promise<T>, initial: T) {
  const [state, setState] = useState<{ value: T; error: string | null; updatedAt: number | null }>({
    value: initial,
    error: null,
    updatedAt: null,
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const run = () =>
      load()
        .then(value => !cancelled && setState({ value, error: null, updatedAt: Date.now() }))
        .catch(err => !cancelled && setState(prev => ({ ...prev, error: err?.message || 'Unavailable' })));
    const first = setTimeout(run, 0);
    const timer = setInterval(run, intervalMs);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [enabled, intervalMs, load]);

  return state;
}

const loadRadar = () => fetchLatestMrms('reflectivity');

/** Latest MRMS composite reflectivity frame (updates every 2 minutes upstream). */
export function useMrms(enabled: boolean) {
  return usePolled<MrmsFrame | null>(enabled, 2 * 60_000, loadRadar, null);
}

/** GLM flashes from the last 15 minutes (rebuilt every minute upstream). */
export function useLightning(enabled: boolean) {
  return usePolled(enabled, 60_000, fetchLightning, EMPTY);
}

/** Active NWS alerts nationwide, most severe first. */
export function useWeatherAlerts(enabled: boolean) {
  return usePolled<WeatherAlert[]>(enabled, 60_000, fetchAlerts, []);
}
