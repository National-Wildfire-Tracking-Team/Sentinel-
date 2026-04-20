/**
 * useFlightData.js
 * Fetches live aircraft positions via the opensky-proxy edge function, which
 * stores results in the aircraft_positions Supabase table. The hook reads
 * directly from that table and subscribes to realtime updates – so all
 * connected clients share a single pool of API credits (166 / hour global).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../api/supabaseClient';
import { triggerFlightFetch } from '../api/openSkyApi';

const REFRESH_MS = 30_000;
const STALE_MS   = 10 * 60 * 1000; // match edge function cleanup window

const AIRCRAFT_CATEGORIES = {
  0:  'No information',
  1:  'No ADS-B emitter category',
  2:  'Light aircraft',
  3:  'Small aircraft',
  4:  'Large aircraft',
  5:  'High vortex large',
  6:  'Heavy aircraft',
  7:  'High performance',
  8:  'Rotorcraft',
  9:  'Glider / Sailplane',
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

function rowsToGeoJSON(rows) {
  const features = rows
    .filter(r => !r.on_ground && r.longitude != null && r.latitude != null)
    .map(r => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [r.longitude, r.latitude],
      },
      properties: {
        icao24:         r.icao24,
        callsign:       r.callsign,
        origin_country: r.origin_country,
        baro_altitude:  r.baro_altitude,
        on_ground:      r.on_ground,
        velocity:       r.velocity,
        true_track:     r.true_track ?? 0,
        vertical_rate:  r.vertical_rate,
        squawk:         r.squawk,
        category:       r.category != null
          ? (AIRCRAFT_CATEGORIES[r.category] ?? String(r.category))
          : null,
      },
    }));
  return { type: 'FeatureCollection', features };
}

async function readFromTable() {
  const staleThreshold = new Date(Date.now() - STALE_MS).toISOString();
  const { data, error } = await supabase
    .from('aircraft_positions')
    .select('*')
    .gte('fetched_at', staleThreshold);
  if (error) throw new Error(error.message);
  return rowsToGeoJSON(data ?? []);
}

export function useFlightData(bounds, enabled = false) {
  const [geoJSON,  setGeoJSON]  = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const intervalRef  = useRef(null);
  const channelRef   = useRef(null);
  const mountedRef   = useRef(true);

  // Subscribe to realtime table changes so all clients update immediately
  // when any one client triggers a fresh fetch.
  useEffect(() => {
    if (!enabled || !isSupabaseConfigured) return;

    channelRef.current = supabase
      .channel('aircraft-positions-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'aircraft_positions' },
        () => {
          readFromTable()
            .then(geo => { if (mountedRef.current) setGeoJSON(geo); })
            .catch(err => {
              console.warn('[FlightData] Realtime read error:', err.message);
            });
        },
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [enabled]);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      setLoading(true);
      setError(null);

      if (isSupabaseConfigured) {
        // Trigger edge function to fetch fresh data from OpenSky and store it.
        // Rate limiting (client-side + server-side) is handled inside.
        // Skip edge function — data is already synced via GitHub Action
        const geo = await readFromTable();
        if (mountedRef.current) setGeoJSON(geo);
        // Read the just-stored data from the table.
        const geo = await readFromTable();
        if (mountedRef.current) setGeoJSON(geo);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [bounds, enabled]);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) {
      load();
      intervalRef.current = setInterval(load, REFRESH_MS);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => {
      mountedRef.current = false;
      clearInterval(intervalRef.current);
    };
  }, [load, enabled]);

  return { geoJSON, loading, error, refresh: load };
}
