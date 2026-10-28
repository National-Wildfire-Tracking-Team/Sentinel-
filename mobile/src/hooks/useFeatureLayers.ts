/**
 * Loads the GeoJSON layers that are on: timed layers poll on the web's cadence; viewport layers
 * (schools, infrastructure, land ownership) reload for the visible area after the map settles.
 * Each keeps its last good data on errors, like the web's layer hooks.
 */
import { useEffect, useRef, useState } from 'react';

import type { Viewport } from '@/data/arcgisQuery';
import { FEATURE_SOURCES } from '@/map/featureSources';
import type { StyleLayerSpec } from '@/map/featureStyles';

export interface FeatureLayerData {
  key: string;
  data: GeoJSON.FeatureCollection;
  /** Style layers to use instead of FEATURE_STYLES[key] (station field, smoke hour). */
  specs?: StyleLayerSpec[];
}

const VIEWPORT_DEBOUNCE_MS = 450;

export function useFeatureLayers(sourceKeys: string[], viewport: Viewport | null) {
  const [data, setData] = useState<Record<string, GeoJSON.FeatureCollection>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const keysId = sourceKeys.join(',');

  // Timed sources.
  useEffect(() => {
    const keys = keysId ? keysId.split(',') : [];
    const cancelled = { current: false };
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const intervals: ReturnType<typeof setInterval>[] = [];
    for (const key of keys) {
      const def = FEATURE_SOURCES[key];
      if (!def || def.viewport) continue;
      const run = () =>
        def
          .load(null)
          .then(fc => {
            if (cancelled.current) return;
            setData(prev => ({ ...prev, [key]: fc }));
            setErrors(prev => (prev[key] ? { ...prev, [key]: '' } : prev));
          })
          .catch(err => !cancelled.current && setErrors(prev => ({ ...prev, [key]: err?.message || 'Unavailable' })));
      timeouts.push(setTimeout(run, 0));
      intervals.push(setInterval(run, def.refreshMinutes * 60_000));
    }
    return () => {
      cancelled.current = true;
      timeouts.forEach(clearTimeout);
      intervals.forEach(clearInterval);
    };
  }, [keysId]);

  // Viewport sources: debounce camera moves, drop stale responses.
  const requestId = useRef(0);
  useEffect(() => {
    const keys = (keysId ? keysId.split(',') : []).filter(k => FEATURE_SOURCES[k]?.viewport);
    if (keys.length === 0 || !viewport) return;
    const id = ++requestId.current;
    const timer = setTimeout(() => {
      for (const key of keys) {
        const def = FEATURE_SOURCES[key];
        if (viewport.zoom < (def.viewport?.minZoom ?? 0)) continue;
        def
          .load(viewport)
          .then(fc => {
            if (requestId.current !== id) return;
            setData(prev => ({ ...prev, [key]: fc }));
          })
          .catch(err => requestId.current === id && setErrors(prev => ({ ...prev, [key]: err?.message || 'Unavailable' })));
      }
    }, VIEWPORT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [keysId, viewport]);

  return { data, errors };
}
