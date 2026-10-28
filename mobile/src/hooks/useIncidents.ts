import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { REFRESH_INTERVAL_MS } from '@/config/env';
import { loadIncidents, type Incident } from '@/data/incidents';

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export interface IncidentsState {
  incidents: Incident[];
  perimeters: GeoJSON.FeatureCollection;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
}

/** Loads incidents from the AWS merge service; refreshes every 5 minutes and on return to the foreground. */
export function useIncidents(): IncidentsState {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [perimeters, setPerimeters] = useState<GeoJSON.FeatureCollection>(EMPTY_FC);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const inflight = useRef(false);
  const lastLoadAt = useRef(0);

  const load = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      const result = await loadIncidents();
      setIncidents(result.incidents);
      setPerimeters(result.perimeters);
      setError(null);
      setLastUpdated(new Date());
      lastLoadAt.current = Date.now();
    } catch (err: any) {
      // Keep showing the last good data on a failed refresh.
      setError(err?.message || 'Could not load incidents');
    } finally {
      inflight.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(load, REFRESH_INTERVAL_MS);
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active' && Date.now() - lastLoadAt.current > REFRESH_INTERVAL_MS) load();
    });
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      sub.remove();
    };
  }, [load]);

  /** Pull-to-refresh: shows the spinner until the load settles. */
  const refresh = useCallback(() => {
    if (inflight.current) return;
    setRefreshing(true);
    load();
  }, [load]);

  return { incidents, perimeters, loading, refreshing, error, lastUpdated, refresh };
}
