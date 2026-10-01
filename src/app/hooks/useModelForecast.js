/**
 * useModelForecast.js
 * React state for Weather Models: one model's point forecast, and the
 * model catalog. Both are model output only — nothing here merges in
 * observations or alerts.
 */

import { useEffect, useMemo, useState } from 'react';
import { fetchModelCatalog, fetchModelForecast, WEATHER_MODEL_SERVICE_URL } from '../api/weatherModels';

/**
 * @param {{ model: string|null, lat: number|null, lon: number|null, hours?: number }} args
 *   Pass model=null to skip (e.g. GFS while not comparing).
 * @returns {{ data: object|null, error: Error|null, loading: boolean }}
 */
export function useModelForecast({ model, lat, lon, hours, variables }) {
  const enabled = Boolean(model) && Number.isFinite(lat) && Number.isFinite(lon) && Boolean(WEATHER_MODEL_SERVICE_URL);
  const [state, setState] = useState({ data: null, error: null, loading: enabled, key: null });
  const key = enabled ? `${model}|${lat}|${lon}|${hours ?? ''}|${variables?.join(',') ?? ''}` : null;

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    setState((s) => ({ data: s.key === key ? s.data : null, error: null, loading: true, key }));
    fetchModelForecast({ model, lat, lon, hours, variables })
      .then((data) => { if (!cancelled) setState({ data, error: null, loading: false, key }); })
      .catch((error) => { if (!cancelled) setState({ data: null, error, loading: false, key }); });
    return () => { cancelled = true; };
    // key captures model/lat/lon/hours
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const current = state.key === key;
  const data = enabled && current ? state.data : null;
  const error = enabled && current ? state.error : null;
  const loading = enabled && (!current || state.loading);
  // Stable identity while nothing changed, so consumers can memo on it.
  return useMemo(() => ({ data, error, loading }), [data, error, loading]);
}

/** @param {boolean} [enabled] fetch only once the Models tab is opened */
export function useModelCatalog(enabled = true) {
  const [state, setState] = useState({ catalog: null, error: null });
  useEffect(() => {
    if (!enabled || !WEATHER_MODEL_SERVICE_URL || state.catalog) return undefined;
    let cancelled = false;
    fetchModelCatalog()
      .then((catalog) => { if (!cancelled) setState({ catalog, error: null }); })
      .catch((error) => { if (!cancelled) setState({ catalog: null, error }); });
    return () => { cancelled = true; };
  }, [enabled, state.catalog]);
  return state;
}
