/**
 * useTropicalStorms.js
 * Fetches active tropical storm positions from NOAA NHC and returns a GeoJSON
 * FeatureCollection of current storm locations with metadata.
 * Refreshes every 30 minutes. Only fetches when enabled.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

const NHC_URL = 'https://www.nhc.noaa.gov/CurrentStorms.json';
const REFRESH_MS = 30 * 60 * 1000;
const EMPTY = { type: 'FeatureCollection', features: [] };

function classifyStorm(classification, intensity) {
  const kt = Number(intensity) || 0;
  if (classification === 'TD' || classification === 'SD') return 'TD';
  if (classification === 'TS' || classification === 'SS') return 'TS';
  if (kt >= 96) return 'H3'; // Major hurricane cat 3+
  return 'H1'; // Hurricane cat 1-2
}

function stormColor(type) {
  switch (type) {
    case 'TD': return '#facc15'; // yellow
    case 'TS': return '#fb923c'; // orange
    case 'H1': return '#ef4444'; // red
    case 'H3': return '#c026d3'; // magenta (major)
    default:   return '#94a3b8';
  }
}

function toGeoJSON(data) {
  const storms = data?.activeStorms ?? [];
  const features = storms
    .filter(s => s.latNumeric != null && s.lonNumeric != null)
    .map(s => {
      const type = classifyStorm(s.classification, s.intensity);
      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [s.lonNumeric, s.latNumeric],
        },
        properties: {
          id:            s.id,
          name:          s.name,
          classification: s.classification,
          stormType:     type,
          color:         stormColor(type),
          intensity:     s.intensity,   // knots
          pressure:      s.pressure,    // mb
          movementDir:   s.movementDir,
          movementSpeed: s.movementSpeed,
          lastUpdate:    s.lastUpdate,
          label: `${s.name} (${s.intensity} kt)`,
        },
      };
    });
  return { type: 'FeatureCollection', features };
}

export function useTropicalStorms(enabled = false) {
  const [geoJSON, setGeoJSON] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);
  const intervalRef = useRef(null);

  const load = useCallback(async (signal) => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(NHC_URL, { signal, cache: 'no-cache' });
      if (!res.ok) throw new Error(`NHC returned ${res.status}`);
      const data = await res.json();
      setGeoJSON(toGeoJSON(data));
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(err.message || 'Could not load tropical storm data');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  const refresh = useCallback(() => {
    const c = new AbortController();
    return load(c.signal);
  }, [load]);

  useEffect(() => {
    const c = new AbortController();
    load(c.signal);
    if (enabled) {
      intervalRef.current = setInterval(() => load(c.signal), REFRESH_MS);
    }
    return () => {
      c.abort();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [load, enabled]);

  return { geoJSON, loading, error, refresh };
}
