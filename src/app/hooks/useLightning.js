/**
 * useLightning.js
 * The latest lightning flashes (api/lightning.js) while the layer is on:
 * fetched when it turns on, then every minute, the builder's cadence. A
 * failed refresh keeps the last flashes; they age out on the map anyway.
 */

import { useEffect, useState } from 'react';
import { LIGHTNING_URL, fetchLightning } from '../api/lightning';

const REFRESH_MS = 60 * 1000;

/** @returns {{ data: ReturnType<import('../api/lightning').parseLightning>|null, error: Error|null }} */
export function useLightning(active) {
  const [state, setState] = useState({ data: null, error: null });

  useEffect(() => {
    if (!active || !LIGHTNING_URL) return undefined;
    const controller = new AbortController();
    const load = () => fetchLightning(LIGHTNING_URL, { signal: controller.signal })
      .then((data) => setState({ data, error: null }))
      .catch((error) => {
        if (!controller.signal.aborted) setState((s) => ({ data: s.data, error }));
      });
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => { controller.abort(); clearInterval(id); };
  }, [active]);

  return state;
}
