/**
 * useWeatherAlerts.js
 * Fetches active alerts from NOAA/NWS and FEMA IPAWS, merges them,
 * deduplicates cross-source overlaps, and enriches with zone geometry.
 * NOAA alerts take priority when an alert appears in both feeds.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchFireWeatherAlerts, alertsToGeoJSON, enrichAlertsWithGeometry } from '../api/noaaWeather';
import { fetchFemaAlerts } from '../api/fema';
import { useApp } from '../context/AppContext';

const REFRESH_MS = 5 * 60 * 1000;

/**
 * Build a stable fingerprint for an alert to detect cross-source duplicates.
 * Matches on: normalized event type + first 30 chars of affected area + hour of onset.
 */
function alertFingerprint(alert) {
  const event = (alert.type || '').toLowerCase().replace(/\s+/g, '');
  const area  = (alert.affectedArea || '').slice(0, 30).toLowerCase().replace(/\W/g, '');
  const time  = (alert.effective || alert.onset || alert.sent || '').slice(0, 13); // YYYY-MM-DDTHH
  return `${event}|${area}|${time}`;
}

/**
 * Merge two alert arrays, deduplicating by exact ID and by fingerprint.
 * `primary` alerts win on conflict — their entries are kept and duplicates
 * from `secondary` are dropped.
 * @param {Array} primary   Higher-priority alerts (NOAA)
 * @param {Array} secondary Lower-priority alerts (FEMA)
 * @returns {Array}
 */
function mergeAndDeduplicate(primary, secondary) {
  const seenIds  = new Set(primary.map(a => a.id).filter(Boolean));
  const seenKeys = new Set(primary.map(alertFingerprint));

  const unique = secondary.filter(alert => {
    if (alert.id && seenIds.has(alert.id)) return false;
    const key = alertFingerprint(alert);
    if (seenKeys.has(key)) return false;
    // Register so later FEMA entries don't duplicate each other either
    if (alert.id) seenIds.add(alert.id);
    seenKeys.add(key);
    return true;
  });

  return [...primary, ...unique];
}

export function useWeatherAlerts() {
  const [alerts,   setAlertsState] = useState([]);
  const [geoJSON,  setGeoJSON]     = useState(null);
  const [loading,  setLoading]     = useState(true);
  const [error,    setError]       = useState(null);
  const { setAlerts }              = useApp();
  const intervalRef = useRef(null);
  const mountedRef  = useRef(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch both sources concurrently; FEMA failure is non-fatal
      const [noaaAlerts, femaAlerts] = await Promise.all([
        fetchFireWeatherAlerts(),
        fetchFemaAlerts().catch(err => {
          console.warn('[useWeatherAlerts] FEMA fetch failed, skipping:', err.message);
          return [];
        }),
      ]);

      if (!mountedRef.current) return;

      const merged = mergeAndDeduplicate(noaaAlerts, femaAlerts);

      const enriched = await enrichAlertsWithGeometry(merged);
      if (!mountedRef.current) return;

      setAlertsState(enriched);
      setAlerts(enriched);
      setGeoJSON(alertsToGeoJSON(enriched));
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [setAlerts]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    intervalRef.current = setInterval(load, REFRESH_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(intervalRef.current);
    };
  }, [load]);

  return { alerts, geoJSON, loading, error, refresh: load };
}
