/**
 * useFlightData.js
 * Reads aircraft from Supabase, but only for the visible map region and only
 * when zoomed in enough to make flight rendering useful.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../api/supabaseClient';

const REFRESH_MS = 30_000;
const STALE_MS = 3 * 60 * 60 * 1000;
const MIN_FLIGHT_ZOOM = 4.5;

const AIRCRAFT_CATEGORIES = {
  0: 'No information',
  1: 'No ADS-B emitter category',
  2: 'Light aircraft',
  3: 'Small aircraft',
  4: 'Large aircraft',
  5: 'High vortex large',
  6: 'Heavy aircraft',
  7: 'High performance',
  8: 'Rotorcraft',
  9: 'Glider / Sailplane',
  10: 'Lighter-than-air',
  11: 'Parachutist / Skydiver',
  12: 'Ultralight / Hang-glider',
  13: 'Reserved',
  14: 'Unmanned aerial vehicle',
  15: 'Space vehicle',
  16: 'Surface – Emergency',
  17: 'Surface – Service',
  18: 'Point obstacle',
  19: 'Cluster obstacle',
  20: 'Line obstacle',
};

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

function rowsToGeoJSON(rows) {
  const features = rows
    .filter((r) => !r.on_ground && r.longitude != null && r.latitude != null)
    .map((r) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [r.longitude, r.latitude],
      },
      properties: {
        icao24: r.icao24,
        callsign: r.callsign,
        origin_country: r.origin_country,
        baro_altitude: r.baro_altitude,
        on_ground: r.on_ground,
        velocity: r.velocity,
        true_track: r.true_track ?? 0,
        vertical_rate: r.vertical_rate,
        squawk: r.squawk,
        category:
          r.category != null
            ? (AIRCRAFT_CATEGORIES[r.category] ?? String(r.category))
            : null,
      },
    }));

  return { type: 'FeatureCollection', features };
}

function normalizeBounds(bounds) {
  if (!bounds) return null;

  const west = Number(bounds.west);
  const south = Number(bounds.south);
  const east = Number(bounds.east);
  const north = Number(bounds.north);
  const zoom = Number(bounds.zoom ?? 0);

  if (
    !Number.isFinite(west) ||
    !Number.isFinite(south) ||
    !Number.isFinite(east) ||
    !Number.isFinite(north)
  ) {
    return null;
  }

  return { west, south, east, north, zoom };
}

function expandBounds(bounds, padFraction = 0.2) {
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

function enforceMinimumSpan(bounds) {
  const minLonSpan = 8;
  const minLatSpan = 6;

  const lonSpan = Math.max(bounds.east - bounds.west, minLonSpan);
  const latSpan = Math.max(bounds.north - bounds.south, minLatSpan);

  const centerLon = (bounds.west + bounds.east) / 2;
  const centerLat = (bounds.south + bounds.north) / 2;

  return {
    ...bounds,
    west: centerLon - lonSpan / 2,
    east: centerLon + lonSpan / 2,
    south: centerLat - latSpan / 2,
    north: centerLat + latSpan / 2,
  };
}

function shouldShowFlights(bounds) {
  if (!bounds) return false;
  return (bounds.zoom ?? 0) >= MIN_FLIGHT_ZOOM;
}

async function readFromTable(bounds) {
  const staleThreshold = new Date(Date.now() - STALE_MS).toISOString();
  const normalized = normalizeBounds(bounds);

  if (!normalized || !shouldShowFlights(normalized)) {
    return EMPTY_GEOJSON;
  }

  const padded = expandBounds(enforceMinimumSpan(normalized));

  const { data, error } = await supabase
    .from('aircraft_positions')
    .select('*')
    .gte('fetched_at', staleThreshold)
    .gte('latitude', padded.south)
    .lte('latitude', padded.north)
    .gte('longitude', padded.west)
    .lte('longitude', padded.east);

  if (error) throw new Error(error.message);

  return rowsToGeoJSON(data ?? []);
}

export function useFlightData(bounds, enabled = false) {
  const [geoJSON, setGeoJSON] = useState(EMPTY_GEOJSON);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const intervalRef = useRef(null);
  const channelRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!enabled || !isSupabaseConfigured) {
      if (mountedRef.current) setGeoJSON(EMPTY_GEOJSON);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const geo = await readFromTable(bounds);
      if (mountedRef.current) setGeoJSON(geo);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err.message || 'Failed to load flight data');
      setGeoJSON(EMPTY_GEOJSON);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [bounds, enabled]);

  useEffect(() => {
    if (!enabled || !isSupabaseConfigured) return;

    channelRef.current = supabase
      .channel('aircraft-positions-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'aircraft_positions' },
        () => {
          load().catch((err) => {
            console.warn('[FlightData] Realtime reload error:', err.message);
          });
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [enabled, load]);

  useEffect(() => {
    if (enabled) {
      load();
      intervalRef.current = setInterval(load, REFRESH_MS);
    } else {
      setGeoJSON(EMPTY_GEOJSON);
      clearInterval(intervalRef.current);
    }

    return () => {
      clearInterval(intervalRef.current);
    };
  }, [enabled, load]);

  return { geoJSON, loading, error, refresh: load };
}