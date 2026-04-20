import { useState, useEffect, useCallback, useRef } from 'react';

const REFRESH_MS = 30_000;
const MIN_FLIGHT_ZOOM = 5.5;
const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

function shouldShowFlights(bounds) {
  return !!bounds && Number(bounds.zoom ?? 0) >= MIN_FLIGHT_ZOOM;
}

function expandBounds(bounds, padFraction = 0.15) {
  const width = bounds.east - bounds.west;
  const height = bounds.north - bounds.south;

  return {
    ...bounds,
    west: bounds.west - width * padFraction,
    east: bounds.east + width * padFraction,
    south: bounds.south - height * padFraction,
    north: bounds.north + height * padFraction,
  };
}

export function useFlightData(bounds, enabled = false) {
  const [geoJSON, setGeoJSON] = useState(EMPTY_GEOJSON);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const intervalRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!enabled || !shouldShowFlights(bounds)) {
      if (mountedRef.current) setGeoJSON(EMPTY_GEOJSON);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const padded = expandBounds(bounds);

      const resp = await fetch('/.netlify/functions/opensky-bbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lamin: padded.south,
          lomin: padded.west,
          lamax: padded.north,
          lomax: padded.east,
        }),
      });

      const result = await resp.json();

      if (!resp.ok) {
        throw new Error(result?.error || 'Failed to fetch flights');
      }

      if (mountedRef.current) {
        setGeoJSON(result.geoJSON || EMPTY_GEOJSON);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
      setGeoJSON(EMPTY_GEOJSON);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [bounds, enabled]);

  useEffect(() => {
    if (enabled) {
      load();
      intervalRef.current = setInterval(load, REFRESH_MS);
    } else {
      setGeoJSON(EMPTY_GEOJSON);
      clearInterval(intervalRef.current);
    }

    return () => clearInterval(intervalRef.current);
  }, [enabled, load]);

  return { geoJSON, loading, error, refresh: load };
}