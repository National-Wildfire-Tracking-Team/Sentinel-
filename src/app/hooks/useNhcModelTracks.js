/**
 * useNhcModelTracks.js
 * Latest-cycle spaghetti model tracks for one storm (see api/nhcModelTracks.js)
 * while they're shown on the map; refreshes every 5 minutes, the service's own
 * revalidation interval.
 */

import { useEffect, useState } from 'react';
import { fetchModelTracks } from '../api/nhcModelTracks';

const REFRESH_MS = 5 * 60 * 1000;

/** @returns {{ status: 'idle'|'loading'|'ready'|'error', data: object|null }} */
export function useNhcModelTracks(atcfId) {
  const [state, setState] = useState({ id: null, status: 'idle', data: null });

  useEffect(() => {
    if (!atcfId) return undefined;
    let cancelled = false;
    const load = () => fetchModelTracks(atcfId)
      .then((data) => { if (!cancelled) setState({ id: atcfId, status: 'ready', data }); })
      .catch(() => { if (!cancelled) setState((s) => (s.id === atcfId && s.data ? s : { id: atcfId, status: 'error', data: null })); });
    setState((s) => (s.id === atcfId ? s : { id: atcfId, status: 'loading', data: null }));
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [atcfId]);

  if (!atcfId) return { status: 'idle', data: null };
  return state.id === atcfId ? { status: state.status, data: state.data } : { status: 'loading', data: null };
}
