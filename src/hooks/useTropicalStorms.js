/**
 * useTropicalStorms.js
 * Fetches active tropical storm positions from NOAA NHC and returns a GeoJSON
 * FeatureCollection. Refreshes every 30 minutes. Only fetches when enabled.
 *
 * NHC coordinate note: latNumeric/lonNumeric are unsigned magnitudes.
 * The sign must be derived from the "N/S" and "E/W" suffix on the
 * latitude/longitude string fields (e.g. "76.8W" → -76.8).
 */

import { useState, useEffect, useCallback, useRef } from 'react';

const NHC_URL = 'https://www.nhc.noaa.gov/CurrentStorms.json';
const REFRESH_MS = 30 * 60 * 1000;
const EMPTY = { type: 'FeatureCollection', features: [] };

/**
 * Parse a NHC coordinate string like "25.5N", "76.8W" into a signed decimal.
 * Falls back to `numericFallback` (unsigned) with `positiveHemisphere` flag.
 */
function parseCoord(str, numericFallback, positiveHemisphere) {
  if (typeof str === 'string') {
    const upper = str.toUpperCase().trim();
    const val = parseFloat(upper);
    if (!Number.isNaN(val)) {
      const lastChar = upper[upper.length - 1];
      if (lastChar === 'S' || lastChar === 'W') return -Math.abs(val);
      return Math.abs(val);
    }
  }
  // Fall back: treat numericFallback as unsigned magnitude
  const mag = Math.abs(Number(numericFallback) || 0);
  return positiveHemisphere ? mag : -mag;
}

function classifyStorm(classification, intensity) {
  const kt = Number(intensity) || 0;
  if (classification === 'TD' || classification === 'SD') return 'TD';
  if (classification === 'TS' || classification === 'SS') return 'TS';
  if (kt >= 96) return 'H3'; // major hurricane cat 3+
  if (kt >= 64) return 'H1'; // hurricane cat 1-2
  return 'TS';
}

function stormColor(type) {
  switch (type) {
    case 'TD': return '#facc15';
    case 'TS': return '#fb923c';
    case 'H1': return '#ef4444';
    case 'H3': return '#c026d3';
    default:   return '#94a3b8';
  }
}

function stormLabel(type) {
  switch (type) {
    case 'TD': return 'Tropical Depression';
    case 'TS': return 'Tropical Storm';
    case 'H1': return 'Hurricane';
    case 'H3': return 'Major Hurricane';
    default:   return 'Storm';
  }
}

function toGeoJSON(data) {
  // NHC wraps storms under `activeStorms`; some versions use `activeCyclones`
  const storms = data?.activeStorms ?? data?.activeCyclones ?? [];

  const features = storms
    .filter(s => (s.latNumeric != null || s.latitude) && (s.lonNumeric != null || s.longitude))
    .map(s => {
      const lat = parseCoord(s.latitude,  s.latNumeric, true);
      const lon = parseCoord(s.longitude, s.lonNumeric, false); // West = negative

      const type  = classifyStorm(s.classification, s.intensity);
      const color = stormColor(type);
      const kt    = Number(s.intensity) || 0;
      const name  = s.name || s.id || 'Unknown';

      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: {
          id:             s.id,
          name,
          classification: s.classification,
          stormType:      type,
          stormLabel:     stormLabel(type),
          color,
          intensity:      kt,
          pressure:       s.pressure,
          movementDir:    s.movementDir,
          movementSpeed:  s.movementSpeed,
          lastUpdate:     s.lastUpdate,
          label:          kt > 0 ? `${name} (${kt} kt)` : name,
        },
      };
    });

  return { type: 'FeatureCollection', features };
}

export function useTropicalStorms(enabled = false) {
  const [geoJSON, setGeoJSON]   = useState(EMPTY);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [stormCount, setStormCount] = useState(null); // null = not yet loaded
  const intervalRef = useRef(null);

  const load = useCallback(async (signal) => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(NHC_URL, { signal });
      if (!res.ok) throw new Error(`NHC API returned ${res.status}`);
      const data  = await res.json();
      const gj    = toGeoJSON(data);
      setGeoJSON(gj);
      setStormCount(gj.features.length);
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('[TropicalStorms]', err.message);
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

  return { geoJSON, loading, error, stormCount, refresh };
}
