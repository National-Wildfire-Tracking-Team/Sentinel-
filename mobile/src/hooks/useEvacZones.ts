import { useEffect, useState } from 'react';

import { REFRESH_INTERVAL_MS } from '@/config/env';
import { loadEvacZones } from '@/data/evacZones';

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/** Evacuation zones while the layer is on, refreshed on the web's interval; kept when switched off. */
export function useEvacZones(enabled: boolean): GeoJSON.FeatureCollection {
  const [zones, setZones] = useState(EMPTY);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = () =>
      loadEvacZones()
        .then(fc => !cancelled && setZones(fc))
        .catch(() => {
          // Keep the last zones; every source already degrades to empty on its own.
        });
    const first = setTimeout(load, 0);
    const timer = setInterval(load, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [enabled]);

  return zones;
}
